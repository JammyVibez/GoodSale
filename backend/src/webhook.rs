use crate::AppState;
use axum::{
    body::Bytes,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use hmac::{Hmac, Mac};
use serde_json::{json, Value};
use sha2::Sha512;

type PaystackHmac = Hmac<Sha512>;

fn reply(status: StatusCode, payload: Value) -> Response {
    (status, Json(payload)).into_response()
}

fn verify_signature(raw_body: &[u8], signature: &str, secret: &str) -> bool {
    let signature = signature.trim();
    if signature.len() != 128 {
        return false;
    }
    let Ok(signature_bytes) = hex::decode(signature) else {
        return false;
    };
    let Ok(mut mac) = PaystackHmac::new_from_slice(secret.as_bytes()) else {
        return false;
    };
    mac.update(raw_body);
    mac.verify_slice(&signature_bytes).is_ok()
}

async fn table_rows(
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
        tracing::warn!(table, status = %response.status(), "Paystack webhook database lookup failed");
        return Err(StatusCode::BAD_GATEWAY);
    }
    response
        .json::<Vec<Value>>()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)
}

async fn service_rpc(
    state: &AppState,
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
        .bearer_auth(key)
        .json(&args)
        .send()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;
    let status = response.status();
    if !status.is_success() {
        tracing::warn!(rpc = name, %status, "Paystack webhook service RPC failed");
        return Err(StatusCode::BAD_GATEWAY);
    }
    Ok(response.json::<Value>().await.unwrap_or(Value::Null))
}

fn first_string<'a>(value: &'a Value, keys: &[&str]) -> &'a str {
    keys.iter()
        .find_map(|key| value.get(*key).and_then(Value::as_str))
        .unwrap_or("")
        .trim()
}

fn positive_integer(value: Option<&Value>) -> bool {
    value
        .and_then(|value| {
            value
                .as_i64()
                .or_else(|| value.as_str().and_then(|text| text.parse::<i64>().ok()))
        })
        .is_some_and(|number| number > 0)
}

async fn find_withdrawal(
    state: &AppState,
    provider_reference: &str,
    transfer_code: &str,
) -> Result<Option<Value>, StatusCode> {
    if !provider_reference.is_empty() {
        let rows = table_rows(
            state,
            "withdrawal_requests",
            &[
                ("select".to_owned(), "id,status".to_owned()),
                ("paystack_reference".to_owned(), format!("eq.{provider_reference}")),
                ("limit".to_owned(), "1".to_owned()),
            ],
        )
        .await?;
        if let Some(row) = rows.into_iter().next() {
            return Ok(Some(row));
        }
    }

    if !transfer_code.is_empty() {
        let rows = table_rows(
            state,
            "withdrawal_requests",
            &[
                ("select".to_owned(), "id,status".to_owned()),
                ("paystack_transfer_code".to_owned(), format!("eq.{transfer_code}")),
                ("limit".to_owned(), "1".to_owned()),
            ],
        )
        .await?;
        return Ok(rows.into_iter().next());
    }

    Ok(None)
}

async fn update_refund_status(
    state: &AppState,
    refund_id: i64,
    status: &str,
) -> Result<bool, StatusCode> {
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
    let id_filter = format!("eq.{refund_id}");
    let status_filter = format!("neq.{status}");
    let response = state
        .http
        .patch(format!("{}/rest/v1/refunds", base.trim_end_matches('/')))
        .header("apikey", key)
        .bearer_auth(key)
        .header("Prefer", "return=representation")
        .query(&[("id", id_filter.as_str()), ("status", status_filter.as_str())])
        .json(&json!({ "status": status }))
        .send()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;
    if !response.status().is_success() {
        tracing::warn!(refund_id, status = %response.status(), "Paystack refund status update failed");
        return Err(StatusCode::BAD_GATEWAY);
    }
    let changed = response
        .json::<Vec<Value>>()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;
    Ok(!changed.is_empty())
}

async fn insert_refund_notification(state: &AppState, buyer_id: i64, completed: bool) {
    let Some(base) = state.settings.supabase_url.as_ref() else {
        return;
    };
    let Some(key) = state.settings.supabase_service_role_key.as_ref() else {
        return;
    };
    let (title, message) = if completed {
        (
            "Refund completed",
            "Paystack completed your refund to the original payment method.",
        )
    } else {
        (
            "Refund failed",
            "Paystack could not complete your refund. Support will review it.",
        )
    };
    let result = state
        .http
        .post(format!("{}/rest/v1/notifications", base.trim_end_matches('/')))
        .header("apikey", key)
        .bearer_auth(key)
        .header("Prefer", "return=minimal")
        .json(&json!({
            "user_id": buyer_id,
            "title": title,
            "message": message,
            "type": "WALLET",
            "is_read": false
        }))
        .send()
        .await;
    match result {
        Ok(response) if response.status().is_success() => {}
        Ok(response) => {
            tracing::warn!(buyer_id, status = %response.status(), "Could not create refund notification");
        }
        Err(_) => tracing::warn!(buyer_id, "Could not reach Supabase to create refund notification"),
    }
}

async fn dispatch_event(state: &AppState, event: &Value) -> Result<Value, StatusCode> {
    let event_name = event
        .get("event")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let data = event.get("data").unwrap_or(&Value::Null);

    if event_name == "charge.success"
        && data.get("status").and_then(Value::as_str) == Some("success")
    {
        let reference = first_string(data, &["reference"]);
        if reference.is_empty() || reference.len() > 128 {
            return Err(StatusCode::BAD_REQUEST);
        }

        if reference.to_ascii_uppercase().starts_with("GSP_") {
            let premium = crate::wallet_premium::verify_premium_event(state, reference).await?;
            return Ok(json!({
                "success": true,
                "received": true,
                "premium": premium
            }));
        }

        if positive_integer(data.pointer("/metadata/wallet_funding_id"))
            || reference.to_ascii_uppercase().starts_with("GSW_")
        {
            let funding = crate::wallet_premium::verify_wallet_event(state, reference).await?;
            return Ok(json!({
                "success": true,
                "received": true,
                "funding": funding
            }));
        }

        let reconciliation = crate::payments::verify_event(state, reference).await?;
        return Ok(json!({
            "success": reconciliation.get("success").and_then(Value::as_bool).unwrap_or(true),
            "received": true,
            "reconciliation": reconciliation
        }));
    }

    if matches!(
        event_name,
        "transfer.success" | "transfer.failed" | "transfer.reversed"
    ) {
        let provider_reference = first_string(data, &["reference"]);
        let transfer_code = first_string(data, &["transfer_code"]);
        let Some(withdrawal) =
            find_withdrawal(state, provider_reference, transfer_code).await?
        else {
            tracing::warn!(
                provider_reference,
                transfer_code,
                "Paystack transfer webhook has no matching withdrawal"
            );
            return Ok(json!({
                "success": true,
                "received": true,
                "ignored": true
            }));
        };
        let withdrawal_id = withdrawal
            .get("id")
            .and_then(Value::as_i64)
            .filter(|id| *id > 0)
            .ok_or(StatusCode::BAD_GATEWAY)?;

        if event_name == "transfer.success" {
            service_rpc(
                state,
                "admin_payout_complete",
                json!({
                    "p_withdrawal_id": withdrawal_id,
                    "p_provider_reference": if provider_reference.is_empty() {
                        transfer_code
                    } else {
                        provider_reference
                    }
                }),
            )
            .await?;
        } else {
            let reason = if event_name == "transfer.reversed" {
                "Paystack reversed the transfer".to_owned()
            } else {
                first_string(data, &["reason", "gateway_response"])
                    .chars()
                    .take(500)
                    .collect::<String>()
            };
            service_rpc(
                state,
                "admin_payout_fail",
                json!({
                    "p_withdrawal_id": withdrawal_id,
                    "p_reason": if reason.is_empty() {
                        "Paystack transfer failed".to_owned()
                    } else {
                        reason
                    }
                }),
            )
            .await?;
        }

        return Ok(json!({ "success": true, "received": true }));
    }

    if matches!(event_name, "refund.processed" | "refund.failed") {
        let transaction_reference =
            first_string(data, &["transaction_reference", "reference"]);
        let provider_reference = first_string(data, &["refund_reference", "reference"]);

        let mut refund = None;
        if !transaction_reference.is_empty() {
            let rows = table_rows(
                state,
                "refunds",
                &[
                    ("select".to_owned(), "id,order_id,status,provider_reference".to_owned()),
                    ("transaction_id".to_owned(), format!("eq.{transaction_reference}")),
                    ("limit".to_owned(), "1".to_owned()),
                ],
            )
            .await?;
            refund = rows.into_iter().next();
        }
        if refund.is_none() && !provider_reference.is_empty() {
            let rows = table_rows(
                state,
                "refunds",
                &[
                    ("select".to_owned(), "id,order_id,status,provider_reference".to_owned()),
                    ("provider_reference".to_owned(), format!("eq.{provider_reference}")),
                    ("limit".to_owned(), "1".to_owned()),
                ],
            )
            .await?;
            refund = rows.into_iter().next();
        }

        if let Some(refund) = refund {
            let refund_id = refund
                .get("id")
                .and_then(Value::as_i64)
                .filter(|id| *id > 0)
                .ok_or(StatusCode::BAD_GATEWAY)?;
            let completed = event_name == "refund.processed";
            let next_status = if completed { "COMPLETED" } else { "FAILED" };
            let current_status = refund
                .get("status")
                .and_then(Value::as_str)
                .unwrap_or_default();
            if current_status != next_status
                && update_refund_status(state, refund_id, next_status).await?
            {
                if let Some(order_id) = refund.get("order_id").and_then(Value::as_i64) {
                    let orders = table_rows(
                        state,
                        "orders",
                        &[
                            ("select".to_owned(), "buyer_id".to_owned()),
                            ("id".to_owned(), format!("eq.{order_id}")),
                            ("limit".to_owned(), "1".to_owned()),
                        ],
                    )
                    .await?;
                    if let Some(buyer_id) = orders
                        .first()
                        .and_then(|order| order.get("buyer_id"))
                        .and_then(Value::as_i64)
                    {
                        insert_refund_notification(state, buyer_id, completed).await;
                    }
                }
            }
        }
        return Ok(json!({ "success": true, "received": true }));
    }

    Ok(json!({ "success": true, "received": true }))
}

pub async fn receive(
    State(state): State<AppState>,
    headers: HeaderMap,
    raw_body: Bytes,
) -> Response {
    let secret = std::env::var("PAYSTACK_WEBHOOK_SECRET")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| {
            std::env::var("PAYSTACK_SECRET_KEY")
                .ok()
                .filter(|value| !value.trim().is_empty())
        });
    let Some(secret) = secret else {
        return reply(
            StatusCode::SERVICE_UNAVAILABLE,
            json!({ "success": false, "error": "Webhook is not configured." }),
        );
    };
    let signature = headers
        .get("x-paystack-signature")
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();
    if !verify_signature(&raw_body, signature, &secret) {
        tracing::warn!("Rejected Paystack webhook with an invalid signature");
        return reply(
            StatusCode::UNAUTHORIZED,
            json!({ "success": false, "error": "Invalid signature." }),
        );
    }

    let event: Value = match serde_json::from_slice(&raw_body) {
        Ok(event) if event.is_object() => event,
        _ => {
            return reply(
                StatusCode::BAD_REQUEST,
                json!({ "success": false, "error": "Invalid webhook payload." }),
            )
        }
    };

    match dispatch_event(&state, &event).await {
        Ok(payload) => reply(StatusCode::OK, payload),
        Err(status) => reply(
            status,
            json!({
                "success": false,
                "error": "Webhook processing failed. The provider may retry the event."
            }),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verifies_paystack_hmac_sha512_signature_from_raw_bytes() {
        let secret = "test-paystack-secret";
        let raw_body = br#"{"event":"charge.success","data":{"status":"success"}}"#;
        let mut mac = PaystackHmac::new_from_slice(secret.as_bytes()).unwrap();
        mac.update(raw_body);
        let signature = hex::encode(mac.finalize().into_bytes());

        assert!(verify_signature(raw_body, &signature, secret));
        assert!(!verify_signature(
            br#"{"event":"charge.failed"}"#,
            &signature,
            secret
        ));
        assert!(!verify_signature(raw_body, "not-a-signature", secret));
    }
}
