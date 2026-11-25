use crate::{rpc, AppState};
use axum::{
    extract::State,
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};
use url::form_urlencoded;
use uuid::Uuid;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PayoutReviewRequest {
    withdrawal_id: i64,
    approve: bool,
    notes: Option<String>,
    bank_code: Option<String>,
}

fn error(status: StatusCode, message: impl Into<String>) -> Response {
    (
        status,
        Json(json!({ "success": false, "error": message.into() })),
    )
        .into_response()
}

fn num(row: &Value, key: &str) -> f64 {
    row.get(key)
        .and_then(|v| {
            v.as_f64()
                .or_else(|| v.as_i64().map(|n| n as f64))
                .or_else(|| v.as_str().and_then(|s| s.parse::<f64>().ok()))
        })
        .unwrap_or(0.0)
}

fn bank_code(name: &str, explicit: Option<&str>) -> Option<String> {
    if let Some(code) =
        explicit.filter(|s| (3..=6).contains(&s.len()) && s.chars().all(|c| c.is_ascii_digit()))
    {
        return Some(code.to_owned());
    }
    let key = name
        .to_ascii_lowercase()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect::<String>();
    let codes = [
        ("gtbank", "058"),
        ("gtb", "058"),
        ("accessbank", "044"),
        ("access", "044"),
        ("zenith", "057"),
        ("uba", "033"),
        ("firstbank", "011"),
        ("first", "011"),
        ("fidelity", "070"),
        ("union", "032"),
        ("sterling", "232"),
        ("stanbic", "221"),
        ("polarity", "101"),
        ("kuda", "50211"),
        ("opay", "999992"),
        ("palmpay", "999991"),
        ("moniepoint", "50515"),
        ("providus", "101"),
        ("wema", "035"),
        ("ecobank", "050"),
        ("eco", "050"),
    ];
    codes
        .iter()
        .find(|(n, _)| key.contains(n))
        .map(|(_, c)| (*c).to_owned())
        .or_else(|| {
            std::env::var("PAYSTACK_DEFAULT_BANK_CODE")
                .ok()
                .filter(|s| (3..=6).contains(&s.len()) && s.chars().all(|c| c.is_ascii_digit()))
        })
}

async fn service_rows(
    state: &AppState,
    table: &str,
    query: &[(&str, String)],
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
    let response = state
        .http
        .get(format!("{}/rest/v1/{table}", base.trim_end_matches('/')))
        .header("apikey", key)
        .bearer_auth(key)
        .query(query)
        .send()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;
    if !response.status().is_success() {
        tracing::warn!(table, status = %response.status(), "Payout lookup failed");
        return Err(StatusCode::BAD_GATEWAY);
    }
    response
        .json::<Vec<Value>>()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)
}

async fn admin_rpc(
    state: &AppState,
    token: &str,
    name: &str,
    args: Value,
) -> Result<Value, StatusCode> {
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
    let response = state
        .http
        .post(format!("{}/rest/v1/rpc/{name}", base.trim_end_matches('/')))
        .header("apikey", key)
        .bearer_auth(token)
        .json(&args)
        .send()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        tracing::warn!(rpc = name, %status, error = %body, "Payout RPC failed");
        return Err(
            if status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN {
                status
            } else {
                StatusCode::CONFLICT
            },
        );
    }
    response
        .json::<Value>()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)
}

async fn paystack(
    state: &AppState,
    method: reqwest::Method,
    path: &str,
    secret: &str,
    body: Option<Value>,
) -> Result<Value, String> {
    let mut request = state
        .http
        .request(method, format!("https://api.paystack.co{path}"))
        .bearer_auth(secret)
        .header(header::CONTENT_TYPE, "application/json");
    if let Some(body) = body {
        request = request.json(&body);
    }
    let response = request
        .send()
        .await
        .map_err(|_| "Paystack could not be reached.".to_owned())?;
    let status = response.status();
    let payload = response
        .json::<Value>()
        .await
        .map_err(|_| "Paystack returned an invalid response.".to_owned())?;
    if !status.is_success() || payload.get("status").and_then(Value::as_bool) == Some(false) {
        return Err(payload
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or("Paystack transfer request failed.")
            .to_owned());
    }
    Ok(payload.get("data").cloned().unwrap_or(Value::Null))
}

async fn patch_fallback(
    state: &AppState,
    id: i64,
    transfer_code: Option<&str>,
    reference: &str,
    notes: &str,
) {
    let (Some(base), Some(key)) = (
        state.settings.supabase_url.as_ref(),
        state.settings.supabase_service_role_key.as_ref(),
    ) else {
        return;
    };
    let filter = format!("eq.{id}");
    let mut patch = serde_json::Map::new();
    patch.insert("paystack_reference".into(), json!(reference));
    if let Some(code) = transfer_code {
        patch.insert("paystack_transfer_code".into(), json!(code));
    }
    if !notes.is_empty() {
        patch.insert("admin_notes".into(), json!(notes));
    }
    match state
        .http
        .patch(format!(
            "{}/rest/v1/withdrawal_requests",
            base.trim_end_matches('/')
        ))
        .header("apikey", key)
        .bearer_auth(key)
        .query(&[("id", filter.as_str())])
        .json(&Value::Object(patch))
        .send()
        .await
    {
        Ok(response) if response.status().is_success() => {}
        Ok(response) => {
            tracing::error!(withdrawal_id = id, status = %response.status(), "Could not persist payout transfer reference")
        }
        Err(error) => {
            tracing::error!(withdrawal_id = id, %error, "Could not persist payout transfer reference")
        }
    }
}

async fn write_audit(state: &AppState, user_id: i64, id: i64, reference: &str) {
    let (Some(base), Some(key)) = (
        state.settings.supabase_url.as_ref(),
        state.settings.supabase_service_role_key.as_ref(),
    ) else {
        return;
    };
    let response = state.http.post(format!("{}/rest/v1/audit_logs", base.trim_end_matches('/')))
        .header("apikey", key).bearer_auth(key).header("Prefer", "return=minimal")
        .json(&json!({
            "user_id": user_id, "action": "WITHDRAWAL_PROVIDER_STARTED",
            "entity_type": "WITHDRAWAL", "entity_id": id,
            "details": format!("Paystack transfer {reference} started after admin review. Provider confirmation still required.")
        })).send().await;
    match response {
        Ok(response) if response.status().is_success() => {}
        Ok(response) => {
            tracing::warn!(withdrawal_id = id, status = %response.status(), "Payout audit insert failed")
        }
        Err(error) => tracing::warn!(withdrawal_id = id, %error, "Payout audit insert failed"),
    }
}

pub async fn review(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<PayoutReviewRequest>,
) -> Response {
    let token = match rpc::require_admin(&state, &headers).await {
        Ok(token) => token,
        Err(code) => return error(code, "Only an administrator can review payouts."),
    };
    if input.withdrawal_id <= 0 {
        return error(StatusCode::BAD_REQUEST, "A valid withdrawalId is required.");
    }
    let notes = input.notes.as_deref().unwrap_or_default().trim();
    let secret = std::env::var("PAYSTACK_SECRET_KEY")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_default();
    if secret.is_empty() {
        return error(
            StatusCode::SERVICE_UNAVAILABLE,
            "Payouts are unavailable until PAYSTACK_SECRET_KEY is configured.",
        );
    }

    let rows = match service_rows(
        &state,
        "withdrawal_requests",
        &[
            ("select", "*".to_owned()),
            ("id", format!("eq.{}", input.withdrawal_id)),
            ("limit", "1".to_owned()),
        ],
    )
    .await
    {
        Ok(rows) => rows,
        Err(code) => return error(code, "Could not load withdrawal."),
    };
    let Some(withdrawal) = rows.first() else {
        return error(StatusCode::NOT_FOUND, "Withdrawal not found.");
    };
    let status = withdrawal
        .get("status")
        .and_then(Value::as_str)
        .unwrap_or_default();

    if !input.approve {
        let data = match admin_rpc(
            &state,
            &token,
            "admin_payout_fail",
            json!({
                "p_withdrawal_id": input.withdrawal_id,
                "p_reason": if notes.is_empty() { "Rejected by admin" } else { notes }
            }),
        )
        .await
        {
            Ok(value) => value,
            Err(code) => return error(code, "Could not reject withdrawal."),
        };
        return (
            StatusCode::OK,
            Json(json!({ "success": true, "status": "FAILED", "data": data })),
        )
            .into_response();
    }
    if status != "PENDING" {
        return error(
            StatusCode::CONFLICT,
            format!("Withdrawal is {status} and cannot be started again."),
        );
    }

    let bank_name = withdrawal
        .get("bank_name")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let bank_code = match bank_code(bank_name, input.bank_code.as_deref().or_else(|| withdrawal.get("bank_code").and_then(Value::as_str))) {
        Some(code) => code,
        None => return error(StatusCode::BAD_REQUEST, "Could not resolve Paystack bank code. Pass bankCode or set PAYSTACK_DEFAULT_BANK_CODE."),
    };
    let account_number = withdrawal
        .get("account_number")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if account_number.len() < 10
        || account_number.len() > 12
        || !account_number.chars().all(|c| c.is_ascii_digit())
    {
        return error(
            StatusCode::BAD_REQUEST,
            "Withdrawal bank account number is invalid.",
        );
    }

    let mut query = form_urlencoded::Serializer::new(String::new());
    query.append_pair("account_number", account_number);
    query.append_pair("bank_code", &bank_code);
    let resolved = match paystack(
        &state,
        reqwest::Method::GET,
        &format!("/bank/resolve?{}", query.finish()),
        &secret,
        None,
    )
    .await
    {
        Ok(data) => data,
        Err(message) => return error(StatusCode::BAD_REQUEST, message),
    };
    let resolved_name = resolved
        .get("account_name")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim();
    let expected_name = withdrawal
        .get("account_name")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim();
    if !expected_name.is_empty()
        && !resolved_name.is_empty()
        && !expected_name.eq_ignore_ascii_case(resolved_name)
    {
        return error(StatusCode::BAD_REQUEST, format!("Account name mismatch. Paystack resolved \"{resolved_name}\". Update the seller bank details before paying out."));
    }
    let recipient_name = if resolved_name.is_empty() {
        if expected_name.is_empty() {
            "GoodSale Seller"
        } else {
            expected_name
        }
    } else {
        resolved_name
    };

    let recipient = match paystack(
        &state,
        reqwest::Method::POST,
        "/transferrecipient",
        &secret,
        Some(json!({
            "type": "nuban", "name": recipient_name, "account_number": account_number,
            "bank_code": bank_code, "currency": "NGN"
        })),
    )
    .await
    {
        Ok(data) => data,
        Err(message) => return error(StatusCode::BAD_REQUEST, message),
    };
    let recipient_code = recipient
        .get("recipient_code")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .unwrap_or_default();
    if recipient_code.is_empty() {
        return error(
            StatusCode::BAD_GATEWAY,
            "Paystack did not return a transfer recipient.",
        );
    }

    if admin_rpc(
        &state,
        &token,
        "admin_payout_begin",
        json!({ "p_withdrawal_id": input.withdrawal_id }),
    )
    .await
    .is_err()
    {
        return error(
            StatusCode::CONFLICT,
            "Withdrawal could not be claimed. It may already be processing.",
        );
    }
    let net_amount = if withdrawal.get("net_amount").is_some_and(|v| !v.is_null()) {
        num(withdrawal, "net_amount")
    } else {
        num(withdrawal, "amount")
    };
    if !net_amount.is_finite() || net_amount <= 0.0 {
        let _ = admin_rpc(
            &state,
            &token,
            "admin_payout_fail",
            json!({
                "p_withdrawal_id": input.withdrawal_id, "p_reason": "Withdrawal amount is invalid"
            }),
        )
        .await;
        return error(
            StatusCode::BAD_REQUEST,
            "Withdrawal amount is invalid. The reservation was returned to the seller.",
        );
    }

    let reference = format!(
        "GS_WD_{}_{}_{}",
        input.withdrawal_id,
        chrono::Utc::now().timestamp_millis(),
        Uuid::new_v4().simple()
    );
    if admin_rpc(
        &state,
        &token,
        "admin_payout_processing",
        json!({
            "p_withdrawal_id": input.withdrawal_id,
            "p_transfer_code": Value::Null,
            "p_provider_reference": reference,
            "p_notes": notes
        }),
    )
    .await
    .is_err()
    {
        let _ = admin_rpc(
            &state,
            &token,
            "admin_payout_fail",
            json!({
                "p_withdrawal_id": input.withdrawal_id,
                "p_reason": "Could not store payout reference before transfer"
            }),
        )
        .await;
        return error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Could not prepare payout safely. Funds were returned to the seller.",
        );
    }

    let transfer = match paystack(&state, reqwest::Method::POST, "/transfer", &secret, Some(json!({
        "source": "balance", "amount": (net_amount * 100.0).round() as i64,
        "recipient": recipient_code, "reason": format!("GoodSale payout #{}", input.withdrawal_id),
        "reference": reference, "currency": "NGN"
    }))).await {
        Ok(data) => data,
        Err(message) => {
            if admin_rpc(&state, &token, "admin_payout_fail", json!({
                "p_withdrawal_id": input.withdrawal_id, "p_reason": message
            })).await.is_err() {
                tracing::error!(withdrawal_id = input.withdrawal_id, "Could not reverse failed payout reservation");
            }
            return error(StatusCode::BAD_REQUEST, message);
        }
    };

    let provider_reference = transfer
        .get("reference")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .unwrap_or(&reference);
    let transfer_code = transfer
        .get("transfer_code")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if admin_rpc(&state, &token, "admin_payout_processing", json!({
        "p_withdrawal_id": input.withdrawal_id,
        "p_transfer_code": if transfer_code.is_empty() { Value::Null } else { json!(transfer_code) },
        "p_provider_reference": provider_reference,
        "p_notes": notes
    })).await.is_err() {
        patch_fallback(&state, input.withdrawal_id, if transfer_code.is_empty() { None } else { Some(transfer_code) }, provider_reference, notes).await;
        tracing::warn!(withdrawal_id = input.withdrawal_id, reference = provider_reference, "Paystack accepted transfer but RPC persistence failed");
    }

    let user_id = withdrawal
        .get("user_id")
        .and_then(Value::as_i64)
        .unwrap_or_default();
    write_audit(&state, user_id, input.withdrawal_id, provider_reference).await;
    let profile = service_rows(
        &state,
        "profiles",
        &[
            ("select", "email".to_owned()),
            ("id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    )
    .await
    .unwrap_or_default();
    let email = profile
        .first()
        .and_then(|row| row.get("email"))
        .and_then(Value::as_str)
        .unwrap_or_default();

    (
        StatusCode::OK,
        Json(json!({
            "success": true,
            "status": "PROCESSING",
            "providerConfirmed": false,
            "message": "Paystack accepted the transfer. The payout stays processing until the provider webhook confirms settlement.",
            "transfer": {
                "reference": provider_reference,
                "transferCode": if transfer_code.is_empty() { Value::Null } else { json!(transfer_code) },
                "netAmount": net_amount,
                "fee": num(withdrawal, "fee")
            },
            "notification": { "email": email, "amount": num(withdrawal, "amount"), "bankName": bank_name }
        })),
    ).into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_known_ngn_banks_and_explicit_codes() {
        assert_eq!(bank_code("GTBank", None).as_deref(), Some("058"));
        assert_eq!(bank_code("Access Bank", None).as_deref(), Some("044"));
        assert_eq!(
            bank_code("No match", Some("999999")).as_deref(),
            Some("999999")
        );
    }
}
