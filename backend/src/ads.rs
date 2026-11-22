use crate::AppState;
use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServeQuery {
    placement: Option<String>,
    state: Option<String>,
    city: Option<String>,
    category: Option<String>,
}

fn number(value: Option<&Value>) -> f64 {
    value
        .and_then(|v| {
            v.as_f64()
                .or_else(|| v.as_i64().map(|n| n as f64))
                .or_else(|| v.as_str().and_then(|s| s.parse::<f64>().ok()))
        })
        .unwrap_or(0.0)
}

fn text(value: Option<&Value>) -> &str {
    value.and_then(Value::as_str).unwrap_or_default()
}

fn placements(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_owned)
                .collect()
        })
        .filter(|items: &Vec<String>| !items.is_empty())
        .unwrap_or_else(|| vec!["HOME".to_owned()])
}

fn matches_target(value: Option<&Value>, requested: &str) -> bool {
    let target = text(value).trim();
    target.is_empty() || target.eq_ignore_ascii_case(requested.trim())
}

fn scheduled_out(value: Option<&Value>, now: DateTime<Utc>, is_start: bool) -> bool {
    let Some(raw) = value.and_then(Value::as_str) else {
        return false;
    };
    let Ok(parsed) = DateTime::parse_from_rfc3339(raw) else {
        return false;
    };
    if is_start {
        parsed.with_timezone(&Utc) > now
    } else {
        parsed.with_timezone(&Utc) <= now
    }
}

async fn rows(
    state: &AppState,
    table: &str,
    query: &[(String, String)],
) -> Result<Vec<Value>, StatusCode> {
    let base = state
        .settings
        .supabase_url
        .as_ref()
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;
    let key = state
        .settings
        .supabase_service_role_key
        .as_ref()
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;
    let params = query
        .iter()
        .map(|(name, value)| (name.as_str(), value.as_str()))
        .collect::<Vec<_>>();
    let response = state
        .http
        .get(format!("{}/rest/v1/{table}", base.trim_end_matches('/')))
        .header("apikey", key)
        .bearer_auth(key)
        .query(&params)
        .send()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;
    if !response.status().is_success() {
        tracing::warn!(table, status = %response.status(), "Sponsored ad query failed");
        return Err(StatusCode::BAD_GATEWAY);
    }
    response
        .json::<Vec<Value>>()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)
}

fn empty() -> Response {
    (StatusCode::OK, Json(json!({ "success": true, "ad": null }))).into_response()
}

pub async fn serve(
    State(state): State<AppState>,
    Query(query): Query<ServeQuery>,
) -> Response {
    let placement = query
        .placement
        .as_deref()
        .unwrap_or("HOME")
        .trim()
        .to_ascii_uppercase();
    if !["HOME", "CATEGORY", "DETAIL", "CHAT", "DASHBOARD", "SEARCH"]
        .contains(&placement.as_str())
    {
        return empty();
    }

    let now = Utc::now();
    let ads = match rows(
        &state,
        "sponsored_ads",
        &[
            ("select".to_owned(), "*".to_owned()),
            ("status".to_owned(), "eq.ACTIVE".to_owned()),
            ("moderation_status".to_owned(), "eq.APPROVED".to_owned()),
            ("order".to_owned(), "id.desc".to_owned()),
            ("limit".to_owned(), "30".to_owned()),
        ],
    )
    .await
    {
        Ok(rows) => rows,
        Err(_) => return empty(),
    };
    if ads.is_empty() {
        return empty();
    }

    let ids = ads
        .iter()
        .filter_map(|row| row.get("id").and_then(Value::as_i64))
        .collect::<Vec<_>>();
    let daily_spend = if ids.is_empty() {
        HashMap::new()
    } else {
        let ids_filter = format!(
            "in.({})",
            ids.iter().map(i64::to_string).collect::<Vec<_>>().join(",")
        );
        let spend_rows = rows(
            &state,
            "sponsored_ad_daily_spend",
            &[
                ("select".to_owned(), "ad_id,spend".to_owned()),
                ("ad_id".to_owned(), ids_filter),
                (
                    "spend_date".to_owned(),
                    format!("eq.{}", now.format("%Y-%m-%d")),
                ),
            ],
        )
        .await
        .unwrap_or_default();
        spend_rows
            .iter()
            .filter_map(|row| {
                Some((
                    row.get("ad_id")?.as_i64()?,
                    number(row.get("spend")),
                ))
            })
            .collect::<HashMap<_, _>>()
    };

    let requested_state = query.state.as_deref().unwrap_or_default();
    let requested_city = query.city.as_deref().unwrap_or_default();
    let requested_category = query.category.as_deref().unwrap_or_default();
    let eligible = ads.iter().find(|ad| {
        let ad_placements = placements(ad.get("placements"));
        if !ad_placements.iter().any(|item| item == &placement) {
            return false;
        }
        if scheduled_out(ad.get("starts_at"), now, true)
            || scheduled_out(ad.get("ends_at"), now, false)
        {
            return false;
        }

        let budget = number(ad.get("budget"));
        let spent = number(ad.get("spent"));
        let daily_budget = number(ad.get("daily_budget"));
        let id = ad.get("id").and_then(Value::as_i64).unwrap_or_default();
        if budget > 0.0 && spent >= budget {
            return false;
        }
        if daily_budget > 0.0 && daily_spend.get(&id).copied().unwrap_or_default() >= daily_budget {
            return false;
        }
        matches_target(ad.get("target_state"), requested_state)
            && matches_target(ad.get("target_city"), requested_city)
            && matches_target(ad.get("target_category"), requested_category)
    });

    let Some(ad) = eligible else {
        return empty();
    };
    let ad_placements = placements(ad.get("placements"));
    let media_type = if text(ad.get("media_type")) == "video" {
        "video"
    } else {
        "image"
    };
    let payload = json!({
        "success": true,
        "ad": {
            "id": number(ad.get("id")),
            "sellerId": number(ad.get("seller_id")),
            "type": ad.get("type"),
            "targetId": number(ad.get("target_id")),
            "bannerUrl": ad.get("banner_url").filter(|v| !v.is_null()),
            "mediaUrl": ad.get("media_url").filter(|v| !v.is_null()),
            "mediaType": media_type,
            "ctaText": text(ad.get("cta_text")),
            "clickView": text(ad.get("click_view")),
            "placements": ad_placements,
            "title": ad.get("title"),
            "status": ad.get("status"),
            "budget": number(ad.get("budget")),
            "dailyBudget": number(ad.get("daily_budget")),
            "spent": number(ad.get("spent")),
            "clicks": number(ad.get("clicks")),
            "impressions": number(ad.get("impressions")),
            "cpcBid": number(ad.get("cpc_bid")),
            "startsAt": ad.get("starts_at").filter(|v| !v.is_null()),
            "endsAt": ad.get("ends_at").filter(|v| !v.is_null())
        }
    });
    (StatusCode::OK, Json(payload)).into_response()
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn placement_defaults_to_home_and_preserves_explicit_placements() {
        assert_eq!(placements(None), vec!["HOME".to_owned()]);
        assert_eq!(
            placements(Some(&json!(["HOME", "CATEGORY"]))),
            vec!["HOME".to_owned(), "CATEGORY".to_owned()]
        );
    }

    #[test]
    fn empty_target_is_global_and_nonempty_target_is_case_insensitive() {
        assert!(matches_target(None, "Lagos"));
        assert!(matches_target(Some(&json!("")), "Lagos"));
        assert!(matches_target(Some(&json!("lagos")), "LAGOS"));
        assert!(!matches_target(Some(&json!("Abuja")), "Lagos"));
    }
}
