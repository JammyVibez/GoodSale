use crate::AppState;
use axum::{
    extract::State,
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

#[derive(Deserialize)]
pub struct VerifyReference {
    reference: String,
}

fn response(status: StatusCode, payload: Value) -> Response {
    (status, Json(payload)).into_response()
}
fn fail(status: StatusCode, message: &str) -> Response {
    response(status, json!({"success":false,"error":message}))
}

async fn auth_user_id(state: &AppState, headers: &HeaderMap) -> Result<String, StatusCode> {
    let token = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .filter(|v| !v.is_empty())
        .ok_or(StatusCode::UNAUTHORIZED)?;
    let base = state
        .settings
        .supabase_url
        .as_ref()
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;
    let anon = state
        .settings
        .supabase_anon_key
        .as_ref()
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;
    let r = state
        .http
        .get(format!("{}/auth/v1/user", base.trim_end_matches('/')))
        .header("apikey", anon)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;
    if !r.status().is_success() {
        return Err(StatusCode::UNAUTHORIZED);
    }
    let u: Value = r.json().await.map_err(|_| StatusCode::BAD_GATEWAY)?;
    u.get("id")
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or(StatusCode::UNAUTHORIZED)
}
async fn auth_email(state: &AppState, headers: &HeaderMap) -> Result<String, StatusCode> {
    let token = headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .filter(|value| !value.is_empty())
        .ok_or(StatusCode::UNAUTHORIZED)?;
    let base = state
        .settings
        .supabase_url
        .as_ref()
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;
    let anon = state
        .settings
        .supabase_anon_key
        .as_ref()
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;
    let response = state
        .http
        .get(format!("{}/auth/v1/user", base.trim_end_matches('/')))
        .header("apikey", anon)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;
    if !response.status().is_success() {
        return Err(StatusCode::UNAUTHORIZED);
    }
    let user: Value = response.json().await.map_err(|_| StatusCode::BAD_GATEWAY)?;
    Ok(user
        .get("email")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned())
}

async fn profile_id(state: &AppState, auth_id: &str) -> Result<i64, StatusCode> {
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
    let r = state
        .http
        .get(format!("{}/rest/v1/profiles", base.trim_end_matches('/')))
        .header("apikey", key)
        .bearer_auth(key)
        .query(&[
            ("select", "id"),
            ("auth_id", format!("eq.{auth_id}").as_str()),
            ("limit", "1"),
        ])
        .send()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;
    if !r.status().is_success() {
        return Err(StatusCode::BAD_GATEWAY);
    }
    let rows: Vec<Value> = r.json().await.map_err(|_| StatusCode::BAD_GATEWAY)?;
    rows.first()
        .and_then(|x| x.get("id"))
        .and_then(Value::as_i64)
        .ok_or(StatusCode::FORBIDDEN)
}
async fn row_by_reference(
    state: &AppState,
    table: &str,
    select: &str,
    reference: &str,
) -> Result<Option<Value>, StatusCode> {
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
    let r = state
        .http
        .get(format!("{}/rest/v1/{table}", base.trim_end_matches('/')))
        .header("apikey", key)
        .bearer_auth(key)
        .query(&[
            ("select", select),
            ("reference", format!("eq.{reference}").as_str()),
            ("limit", "1"),
        ])
        .send()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;
    if !r.status().is_success() {
        return Err(StatusCode::BAD_GATEWAY);
    }
    let rows: Vec<Value> = r.json().await.map_err(|_| StatusCode::BAD_GATEWAY)?;
    Ok(rows.into_iter().next())
}
async fn verify_paystack(state: &AppState, reference: &str) -> Result<Value, StatusCode> {
    let secret = std::env::var("PAYSTACK_SECRET_KEY")
        .ok()
        .filter(|v| !v.trim().is_empty())
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;
    let escaped = url::form_urlencoded::byte_serialize(reference.as_bytes()).collect::<String>();
    let r = state
        .http
        .get(format!(
            "https://api.paystack.co/transaction/verify/{escaped}"
        ))
        .header("Authorization", format!("Bearer {secret}"))
        .send()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;
    let ok = r.status().is_success();
    let payload: Value = r.json().await.map_err(|_| StatusCode::BAD_GATEWAY)?;
    let data = payload.get("data").cloned().unwrap_or(Value::Null);
    if !ok
        || payload.get("status").and_then(Value::as_bool) != Some(true)
        || data.get("status").and_then(Value::as_str) != Some("success")
    {
        return Err(StatusCode::PAYMENT_REQUIRED);
    }
    if data.get("reference").and_then(Value::as_str) != Some(reference) {
        return Err(StatusCode::BAD_REQUEST);
    }
    if !data
        .get("currency")
        .and_then(Value::as_str)
        .unwrap_or("")
        .eq_ignore_ascii_case("NGN")
    {
        return Err(StatusCode::BAD_REQUEST);
    }
    if data.get("amount").and_then(Value::as_i64).unwrap_or(0) <= 0 {
        return Err(StatusCode::BAD_REQUEST);
    }
    Ok(data)
}
async fn call_service_rpc(state: &AppState, name: &str, args: Value) -> Result<Value, StatusCode> {
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
    let r = state
        .http
        .post(format!("{}/rest/v1/rpc/{name}", base.trim_end_matches('/')))
        .header("apikey", key)
        .bearer_auth(key)
        .json(&args)
        .send()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;
    let status = r.status();
    let value: Value = r.json().await.map_err(|_| StatusCode::BAD_GATEWAY)?;
    if !status.is_success() {
        tracing::warn!(rpc=name,status=%status,"Service RPC rejected verification");
        return Err(StatusCode::BAD_GATEWAY);
    }
    Ok(value)
}
fn validate_payment(
    charge: &Value,
    reference: &str,
    amount: f64,
    currency: &str,
) -> Result<(), StatusCode> {
    if charge.get("reference").and_then(Value::as_str) != Some(reference) {
        return Err(StatusCode::BAD_REQUEST);
    }
    if charge.get("amount").and_then(Value::as_i64).unwrap_or(0) != (amount * 100.0).round() as i64
    {
        return Err(StatusCode::BAD_REQUEST);
    }
    if !charge
        .get("currency")
        .and_then(Value::as_str)
        .unwrap_or("")
        .eq_ignore_ascii_case(currency)
    {
        return Err(StatusCode::BAD_REQUEST);
    }
    Ok(())
}
async fn wallet_funding(
    state: &AppState,
    reference: &str,
    expected_user: Option<i64>,
) -> Result<Value, StatusCode> {
    let intent = row_by_reference(
        state,
        "wallet_funding_intents",
        "id,user_id,reference,amount,currency,status",
        reference,
    )
    .await?
    .ok_or(StatusCode::NOT_FOUND)?;
    let id = intent
        .get("id")
        .and_then(Value::as_i64)
        .ok_or(StatusCode::BAD_GATEWAY)?;
    let user = intent
        .get("user_id")
        .and_then(Value::as_i64)
        .ok_or(StatusCode::BAD_GATEWAY)?;
    let amount = intent
        .get("amount")
        .and_then(Value::as_f64)
        .or_else(|| {
            intent
                .get("amount")
                .and_then(Value::as_str)
                .and_then(|v| v.parse().ok())
        })
        .ok_or(StatusCode::BAD_GATEWAY)?;
    let currency = intent
        .get("currency")
        .and_then(Value::as_str)
        .unwrap_or("NGN");
    if expected_user.is_some_and(|expected| expected != user) {
        return Err(StatusCode::NOT_FOUND);
    }
    if intent.get("status").and_then(Value::as_str) == Some("SUCCESS") {
        return Ok(
            json!({"success":true,"alreadyCredited":true,"fundingId":id,"reference":reference}),
        );
    }
    if intent.get("status").and_then(Value::as_str) != Some("PENDING") {
        return Err(StatusCode::CONFLICT);
    }
    let charge = verify_paystack(state, reference).await?;
    validate_payment(&charge, reference, amount, currency)?;
    let provider_ref = charge
        .get("reference")
        .and_then(Value::as_str)
        .unwrap_or(reference);
    call_service_rpc(
        state,
        "credit_wallet_funding",
        json!({
         "p_funding_id":id,"p_provider_reference":provider_ref,
         "p_channel":charge.get("channel").and_then(Value::as_str)
        }),
    )
    .await
}
async fn premium_activation(
    state: &AppState,
    reference: &str,
    expected_user: Option<i64>,
) -> Result<Value, StatusCode> {
    let payment = row_by_reference(
        state,
        "premium_subscription_payments",
        "id,user_id,reference,amount,currency,status",
        reference,
    )
    .await?
    .ok_or(StatusCode::NOT_FOUND)?;
    let user = payment
        .get("user_id")
        .and_then(Value::as_i64)
        .ok_or(StatusCode::BAD_GATEWAY)?;
    let amount = payment
        .get("amount")
        .and_then(Value::as_f64)
        .or_else(|| {
            payment
                .get("amount")
                .and_then(Value::as_str)
                .and_then(|v| v.parse().ok())
        })
        .ok_or(StatusCode::BAD_GATEWAY)?;
    let currency = payment
        .get("currency")
        .and_then(Value::as_str)
        .unwrap_or("NGN");
    if expected_user.is_some_and(|expected| expected != user) {
        return Err(StatusCode::NOT_FOUND);
    }
    if payment.get("status").and_then(Value::as_str) == Some("SUCCESS") {
        return Ok(json!({"success":true,"alreadyActive":true,"reference":reference}));
    }
    if payment.get("status").and_then(Value::as_str) != Some("PENDING") {
        return Err(StatusCode::CONFLICT);
    }
    let charge = verify_paystack(state, reference).await?;
    validate_payment(&charge, reference, amount, currency)?;
    call_service_rpc(
        state,
        "activate_premium_subscription",
        json!({
         "p_reference":reference,
         "p_provider_reference":charge.get("reference").and_then(Value::as_str).unwrap_or(reference)
        }),
    )
    .await
}

pub async fn verify_wallet(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<VerifyReference>,
) -> Response {
    let reference = input.reference.trim();
    if reference.len() < 8
        || reference.len() > 128
        || !reference
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        return fail(
            StatusCode::BAD_REQUEST,
            "A valid payment reference is required.",
        );
    }
    let auth = match auth_user_id(&state, &headers).await {
        Ok(v) => v,
        Err(code) => return fail(code, "Sign in to verify this funding request."),
    };
    let profile = match profile_id(&state, &auth).await {
        Ok(v) => v,
        Err(code) => return fail(code, "Your account profile could not be verified."),
    };
    match wallet_funding(&state, reference, Some(profile)).await {
        Ok(data) => {
            let mut payload = json!({"success":true,"reference":reference,"data":data});
            if let Some(id) = data.get("funding_id").and_then(Value::as_i64) {
                payload["fundingId"] = json!(id)
            };
            response(StatusCode::OK, payload)
        }
        Err(code) => fail(
            code,
            match code {
                StatusCode::PAYMENT_REQUIRED => "Payment has not succeeded.",
                StatusCode::NOT_FOUND => "Funding request not found for this account.",
                StatusCode::CONFLICT => "This funding request is no longer payable.",
                StatusCode::SERVICE_UNAVAILABLE => "Wallet verification is not configured.",
                _ => "Wallet funding could not be verified.",
            },
        ),
    }
}
pub async fn verify_premium(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<VerifyReference>,
) -> Response {
    let reference = input.reference.trim();
    if reference.len() < 8
        || reference.len() > 128
        || !reference
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        return fail(
            StatusCode::BAD_REQUEST,
            "A valid payment reference is required.",
        );
    }
    let auth = match auth_user_id(&state, &headers).await {
        Ok(v) => v,
        Err(code) => return fail(code, "Sign in to verify this membership."),
    };
    let profile = match profile_id(&state, &auth).await {
        Ok(v) => v,
        Err(code) => return fail(code, "Your account profile could not be verified."),
    };
    match premium_activation(&state, reference, Some(profile)).await {
        Ok(data) => response(
            StatusCode::OK,
            json!({"success":true,"reference":reference,"data":data}),
        ),
        Err(code) => fail(
            code,
            match code {
                StatusCode::PAYMENT_REQUIRED => "Payment has not succeeded.",
                StatusCode::NOT_FOUND => "Membership payment not found for this account.",
                StatusCode::CONFLICT => "This membership payment is no longer payable.",
                StatusCode::SERVICE_UNAVAILABLE => "Membership verification is not configured.",
                _ => "Membership could not be verified.",
            },
        ),
    }
}

pub async fn verify_wallet_event(state: &AppState, reference: &str) -> Result<Value, StatusCode> {
    wallet_funding(state, reference, None).await
}
pub async fn verify_premium_event(state: &AppState, reference: &str) -> Result<Value, StatusCode> {
    premium_activation(state, reference, None).await
}
fn number_field(value: Option<&Value>) -> Option<f64> {
    value.and_then(|v| {
        v.as_f64()
            .or_else(|| v.as_str().and_then(|raw| raw.parse::<f64>().ok()))
    })
}

async fn profile_is_suspended(state: &AppState, profile_id: i64) -> Result<bool, StatusCode> {
    let base = state
        .settings
        .supabase_url
        .as_ref()
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;
    let service = state
        .settings
        .supabase_service_role_key
        .as_ref()
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;
    let response = state
        .http
        .get(format!("{}/rest/v1/profiles", base.trim_end_matches('/')))
        .header("apikey", service)
        .bearer_auth(service)
        .query(&[
            ("select", "is_suspended"),
            ("id", format!("eq.{profile_id}").as_str()),
            ("limit", "1"),
        ])
        .send()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;
    if !response.status().is_success() {
        return Err(StatusCode::BAD_GATEWAY);
    }
    let rows: Vec<Value> = response.json().await.map_err(|_| StatusCode::BAD_GATEWAY)?;
    Ok(rows
        .first()
        .and_then(|v| v.get("is_suspended"))
        .and_then(Value::as_bool)
        .unwrap_or(false))
}

async fn insert_service_row(
    state: &AppState,
    table: &str,
    value: Value,
) -> Result<Value, StatusCode> {
    let base = state
        .settings
        .supabase_url
        .as_ref()
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;
    let service = state
        .settings
        .supabase_service_role_key
        .as_ref()
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;
    let response = state
        .http
        .post(format!("{}/rest/v1/{table}", base.trim_end_matches('/')))
        .header("apikey", service)
        .bearer_auth(service)
        .header("Prefer", "return=representation")
        .json(&value)
        .send()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;
    if !response.status().is_success() {
        let code = response.status();
        tracing::warn!(table, status=%code, "Payment intent insertion rejected");
        return Err(if code.is_client_error() {
            StatusCode::BAD_REQUEST
        } else {
            StatusCode::BAD_GATEWAY
        });
    }
    let rows: Vec<Value> = response.json().await.map_err(|_| StatusCode::BAD_GATEWAY)?;
    rows.into_iter().next().ok_or(StatusCode::BAD_GATEWAY)
}

fn new_payment_reference(prefix: &str, profile_id: i64) -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let suffix = Uuid::new_v4().simple().to_string().to_ascii_uppercase();
    format!("{prefix}_{profile_id}_{millis}_{}", &suffix[..8])
}

pub async fn initialize_wallet(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Response {
    let auth = match auth_user_id(&state, &headers).await {
        Ok(id) => id,
        Err(code) => return fail(code, "Sign in to continue."),
    };
    let profile = match profile_id(&state, &auth).await {
        Ok(id) => id,
        Err(code) => return fail(code, "Your account profile could not be verified."),
    };
    let email = auth_email(&state, &headers).await.unwrap_or_default();
    match state
        .limiter
        .check(
            &format!("wallet:init:{profile}"),
            10,
            std::time::Duration::from_secs(60),
        )
        .await
    {
        Ok(decision) if decision.allowed => {}
        Ok(decision) => {
            return fail(
                StatusCode::TOO_MANY_REQUESTS,
                &format!(
                    "Too many funding attempts. Retry in {} seconds.",
                    decision.retry_after_secs
                ),
            )
        }
        Err(_) => {
            return fail(
                StatusCode::SERVICE_UNAVAILABLE,
                "Wallet request protection is unavailable.",
            )
        }
    }
    if profile_is_suspended(&state, profile).await.unwrap_or(true) {
        return fail(StatusCode::FORBIDDEN, "This account cannot fund a wallet.");
    }
    if std::env::var("PAYSTACK_SECRET_KEY")
        .ok()
        .filter(|v| !v.is_empty())
        .is_none()
        || std::env::var("NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY")
            .ok()
            .filter(|v| !v.is_empty())
            .is_none()
    {
        return fail(
            StatusCode::SERVICE_UNAVAILABLE,
            "Wallet funding is not configured.",
        );
    }

    let amount = number_field(body.get("amount"));
    let Some(amount) = amount
        .filter(|v| v.is_finite() && *v > 0.0 && ((v * 100.0).round() - v * 100.0).abs() < 0.001)
    else {
        return fail(StatusCode::BAD_REQUEST, "Enter a valid amount.");
    };

    let base = match state.settings.supabase_url.as_ref() {
        Some(value) => value.trim_end_matches('/'),
        None => {
            return fail(
                StatusCode::SERVICE_UNAVAILABLE,
                "Wallet database is not configured.",
            )
        }
    };
    let service = match state.settings.supabase_service_role_key.as_ref() {
        Some(value) => value,
        None => {
            return fail(
                StatusCode::SERVICE_UNAVAILABLE,
                "Wallet database is not configured.",
            )
        }
    };
    let settings_res = match state
        .http
        .get(format!("{base}/rest/v1/wallet_settings"))
        .header("apikey", service)
        .bearer_auth(service)
        .query(&[
            ("select", "funding_min,funding_max"),
            ("id", "eq.1"),
            ("limit", "1"),
        ])
        .send()
        .await
    {
        Ok(value) => value,
        Err(_) => {
            return fail(
                StatusCode::BAD_GATEWAY,
                "Wallet settings could not be loaded.",
            )
        }
    };
    let settings: Vec<Value> = match settings_res.json().await {
        Ok(value) => value,
        Err(_) => {
            return fail(
                StatusCode::BAD_GATEWAY,
                "Wallet settings could not be read.",
            )
        }
    };
    let min = settings
        .first()
        .and_then(|v| number_field(v.get("funding_min")))
        .unwrap_or(100.0);
    let max = settings
        .first()
        .and_then(|v| number_field(v.get("funding_max")))
        .unwrap_or(500_000.0);
    if amount < min {
        return fail(
            StatusCode::BAD_REQUEST,
            &format!("Minimum wallet funding is ₦{min:.0}."),
        );
    }
    if amount > max {
        return fail(
            StatusCode::BAD_REQUEST,
            &format!("Maximum wallet funding is ₦{max:.0}."),
        );
    }

    let reference = new_payment_reference("GSW", profile);
    let intent = match insert_service_row(
        &state,
        "wallet_funding_intents",
        json!({
            "user_id": profile,
            "reference": reference,
            "provider": "paystack",
            "amount": amount,
            "currency": "NGN",
            "status": "PENDING",
            "metadata": { "source": "wallet" }
        }),
    )
    .await
    {
        Ok(value) => value,
        Err(code) => return fail(code, "Could not create a wallet funding request."),
    };
    (
        StatusCode::OK,
        Json(json!({
            "success": true,
            "reference": reference,
            "amount": amount,
            "currency": "NGN",
            "email": email,
            "publicKey": std::env::var("NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY").unwrap_or_default(),
            "intentId": intent.get("id"),
            "provider": "paystack"
        })),
    )
        .into_response()
}

pub async fn initialize_premium(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Response {
    let auth = match auth_user_id(&state, &headers).await {
        Ok(id) => id,
        Err(code) => return fail(code, "Sign in to continue."),
    };
    let profile = match profile_id(&state, &auth).await {
        Ok(id) => id,
        Err(code) => return fail(code, "Your account profile could not be verified."),
    };
    let email = auth_email(&state, &headers).await.unwrap_or_default();
    match state
        .limiter
        .check(
            &format!("premium:init:{profile}"),
            8,
            std::time::Duration::from_secs(60),
        )
        .await
    {
        Ok(decision) if decision.allowed => {}
        Ok(decision) => {
            return fail(
                StatusCode::TOO_MANY_REQUESTS,
                &format!(
                    "Too many membership attempts. Retry in {} seconds.",
                    decision.retry_after_secs
                ),
            )
        }
        Err(_) => {
            return fail(
                StatusCode::SERVICE_UNAVAILABLE,
                "Membership request protection is unavailable.",
            )
        }
    }
    if profile_is_suspended(&state, profile).await.unwrap_or(true) {
        return fail(
            StatusCode::FORBIDDEN,
            "This account cannot purchase a membership.",
        );
    }
    if std::env::var("PAYSTACK_SECRET_KEY")
        .ok()
        .filter(|v| !v.is_empty())
        .is_none()
        || std::env::var("NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY")
            .ok()
            .filter(|v| !v.is_empty())
            .is_none()
    {
        return fail(
            StatusCode::SERVICE_UNAVAILABLE,
            "Membership checkout is not configured.",
        );
    }

    let product = body
        .get("product")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_ascii_uppercase();
    let plan = body
        .get("planCode")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_ascii_uppercase();
    if product != "VERIFIED_PLUS" && product != "BUSINESS" {
        return fail(StatusCode::BAD_REQUEST, "Choose a valid membership.");
    }
    if product == "BUSINESS" && !matches!(plan.as_str(), "PRO" | "PREMIUM" | "ENTERPRISE") {
        return fail(StatusCode::BAD_REQUEST, "Choose a valid Business plan.");
    }
    let plan_code = if product == "VERIFIED_PLUS" {
        "VERIFIED_PLUS"
    } else {
        plan.as_str()
    };

    let base = match state.settings.supabase_url.as_ref() {
        Some(value) => value.trim_end_matches('/'),
        None => {
            return fail(
                StatusCode::SERVICE_UNAVAILABLE,
                "Membership database is not configured.",
            )
        }
    };
    let service = match state.settings.supabase_service_role_key.as_ref() {
        Some(value) => value,
        None => {
            return fail(
                StatusCode::SERVICE_UNAVAILABLE,
                "Membership database is not configured.",
            )
        }
    };
    let pricing_res = match state.http.get(format!("{base}/rest/v1/revenue_settings"))
        .header("apikey", service).bearer_auth(service)
        .query(&[(
            "select",
            "verified_plus_price,sub_pro_price,sub_premium_price,sub_enterprise_price,premium_duration_days"
        ), ("order", "id.asc"), ("limit", "1")])
        .send().await {
            Ok(value) => value,
            Err(_) => return fail(StatusCode::BAD_GATEWAY, "Membership pricing could not be loaded."),
        };
    let pricing_rows: Vec<Value> = match pricing_res.json().await {
        Ok(value) => value,
        Err(_) => {
            return fail(
                StatusCode::BAD_GATEWAY,
                "Membership pricing could not be read.",
            )
        }
    };
    let settings = pricing_rows.first().cloned().unwrap_or_else(|| json!({}));
    let raw_amount = match (product.as_str(), plan.as_str()) {
        ("VERIFIED_PLUS", _) => number_field(settings.get("verified_plus_price")).unwrap_or(2500.0),
        ("BUSINESS", "PRO") => number_field(settings.get("sub_pro_price")).unwrap_or(15000.0),
        ("BUSINESS", "PREMIUM") => {
            number_field(settings.get("sub_premium_price")).unwrap_or(12500.0)
        }
        ("BUSINESS", "ENTERPRISE") => {
            number_field(settings.get("sub_enterprise_price")).unwrap_or(85000.0)
        }
        _ => 0.0,
    };
    let duration = number_field(settings.get("premium_duration_days"))
        .unwrap_or(30.0)
        .max(1.0) as i64;
    if !raw_amount.is_finite() || raw_amount <= 0.0 || raw_amount > 100_000_000.0 {
        return fail(
            StatusCode::CONFLICT,
            "This membership is not available for purchase right now.",
        );
    }
    let amount_kobo = (raw_amount * 100.0).round() as i64;
    let amount = amount_kobo as f64 / 100.0;
    let reference = new_payment_reference("GSP", profile);
    let intent = match insert_service_row(
        &state,
        "premium_subscription_payments",
        json!({
            "user_id": profile,
            "product": product,
            "plan_code": plan_code,
            "reference": reference,
            "amount": amount,
            "currency": "NGN",
            "status": "PENDING",
            "provider": "paystack"
        }),
    )
    .await
    {
        Ok(value) => value,
        Err(code) => return fail(code, "Could not create the membership checkout."),
    };
    (
        StatusCode::OK,
        Json(json!({
            "success": true,
            "reference": reference,
            "amount": amount,
            "amountKobo": amount_kobo,
            "currency": "NGN",
            "durationDays": duration,
            "email": email,
            "publicKey": std::env::var("NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY").unwrap_or_default(),
            "product": product,
            "planCode": plan_code,
            "paymentId": intent.get("id"),
            "provider": "paystack"
        })),
    )
        .into_response()
}


async fn select_rows(
    state: &AppState,
    table: &str,
    query: &[(String, String)],
) -> Result<Vec<Value>, StatusCode> {
    let base = state.settings.supabase_url.as_ref().ok_or(StatusCode::SERVICE_UNAVAILABLE)?;
    let key = state.settings.supabase_service_role_key.as_ref().ok_or(StatusCode::SERVICE_UNAVAILABLE)?;
    let params = query.iter().map(|(name, value)| (name.as_str(), value.as_str())).collect::<Vec<_>>();
    let response = state.http.get(format!("{}/rest/v1/{table}", base.trim_end_matches('/')))
        .header("apikey", key)
        .bearer_auth(key)
        .query(&params)
        .send().await.map_err(|_| StatusCode::BAD_GATEWAY)?;
    if !response.status().is_success() {
        tracing::warn!(table, status = %response.status(), "Wallet or membership lookup failed");
        return Err(StatusCode::BAD_GATEWAY);
    }
    response.json::<Vec<Value>>().await.map_err(|_| StatusCode::BAD_GATEWAY)
}

fn provider_config() -> Value {
    let secret = std::env::var("PAYSTACK_SECRET_KEY").ok().is_some_and(|v| !v.trim().is_empty());
    let public = std::env::var("NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY").ok().is_some_and(|v| !v.trim().is_empty());
    let webhook = std::env::var("PAYSTACK_WEBHOOK_SECRET").ok().is_some_and(|v| !v.trim().is_empty()) || secret;
    json!({
        "provider": "paystack",
        "fundingEnabled": secret && public,
        "payoutsEnabled": secret,
        "webhookConfigured": webhook
    })
}

fn row_number(row: &Value, key: &str, fallback: f64) -> f64 {
    row.get(key).and_then(|v| v.as_f64()
        .or_else(|| v.as_i64().map(|n| n as f64))
        .or_else(|| v.as_str().and_then(|s| s.parse::<f64>().ok())))
        .unwrap_or(fallback)
}

fn row_date(row: &Value, primary: &str, fallback: &str) -> Value {
    row.get(primary).filter(|v| !v.is_null())
        .or_else(|| row.get(fallback))
        .cloned().unwrap_or(Value::Null)
}

pub async fn wallet_status(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let auth_id = match auth_user_id(&state, &headers).await {
        Ok(id) => id,
        Err(code) => return fail(code, "Sign in to view your wallet."),
    };
    let profile = match profile_id(&state, &auth_id).await {
        Ok(id) => id,
        Err(code) => return fail(code, "Your marketplace profile could not be found."),
    };
    let settings = select_rows(&state, "wallet_settings", &[
        ("select".into(), "funding_min,funding_max,withdrawal_min,withdrawal_max,withdrawal_fee,daily_withdrawal_limit".into()),
        ("id".into(), "eq.1".into()),
        ("limit".into(), "1".into()),
    ]).await.unwrap_or_default();
    let funding = select_rows(&state, "wallet_funding_intents", &[
        ("select".into(), "id,reference,amount,status,provider_reference,created_at,completed_at".into()),
        ("user_id".into(), format!("eq.{profile}")),
        ("order".into(), "created_at.desc".into()),
        ("limit".into(), "20".into()),
    ]).await.unwrap_or_default();
    let limits = settings.first().unwrap_or(&Value::Null);
    let provider = provider_config();
    let funding_available = provider.get("fundingEnabled").and_then(Value::as_bool).unwrap_or(false);
    let payouts_available = provider.get("payoutsEnabled").and_then(Value::as_bool).unwrap_or(false);
    (
        StatusCode::OK,
        Json(json!({
            "success": true,
            "currency": "NGN",
            "provider": provider,
            "fundingAvailable": funding_available,
            "payoutsAvailable": payouts_available,
            "limits": {
                "funding_min": row_number(limits, "funding_min", 100.0),
                "funding_max": row_number(limits, "funding_max", 500000.0),
                "withdrawal_min": row_number(limits, "withdrawal_min", 1000.0),
                "withdrawal_max": row_number(limits, "withdrawal_max", 1000000.0),
                "withdrawal_fee": row_number(limits, "withdrawal_fee", 0.0),
                "daily_withdrawal_limit": row_number(limits, "daily_withdrawal_limit", 1000000.0)
            },
            "funding": funding,
            "source": "server"
        })),
    ).into_response()
}

pub async fn premium_subscriptions(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let auth_id = match auth_user_id(&state, &headers).await {
        Ok(id) => id,
        Err(code) => return fail(code, "Sign in to view your membership."),
    };
    let profile = match profile_id(&state, &auth_id).await {
        Ok(id) => id,
        Err(code) => return fail(code, "Your marketplace profile could not be found."),
    };
    let filter = format!("eq.{profile}");
    let business = select_rows(&state, "business_subscriptions", &[
        ("select".into(), "*".into()), ("user_id".into(), filter.clone()),
        ("order".into(), "expires_at.desc".into()), ("limit".into(), "10".into()),
    ]).await;
    let verified = select_rows(&state, "verified_plus_subscriptions", &[
        ("select".into(), "*".into()), ("user_id".into(), filter.clone()),
        ("order".into(), "expires_at.desc".into()), ("limit".into(), "10".into()),
    ]).await;
    let payments = select_rows(&state, "premium_subscription_payments", &[
        ("select".into(), "reference,product,plan_code,amount,currency,status,starts_at,expires_at,created_at,paid_at".into()),
        ("user_id".into(), filter), ("order".into(), "created_at.desc".into()),
        ("limit".into(), "20".into()),
    ]).await;
    let schema_ready = business.is_ok() && verified.is_ok() && payments.is_ok();
    let business_rows = business.unwrap_or_default();
    let verified_rows = verified.unwrap_or_default();
    let payment_rows = payments.unwrap_or_default();
    let business_subscriptions = business_rows.iter().map(|row| json!({
        "id": row.get("id"),
        "plan": row.get("plan").and_then(Value::as_str).unwrap_or("FREE"),
        "startsAt": row_date(row, "starts_at", "created_at"),
        "expiresAt": row.get("expires_at"),
        "status": row.get("status").and_then(Value::as_str).unwrap_or("ACTIVE"),
        "autoRenew": row.get("auto_renew").and_then(Value::as_bool).unwrap_or(false),
        "cancelledAt": row.get("cancelled_at").filter(|v| !v.is_null())
    })).collect::<Vec<_>>();
    let verified_subscriptions = verified_rows.iter().map(|row| json!({
        "id": row.get("id"),
        "startsAt": row_date(row, "starts_at", "created_at"),
        "expiresAt": row.get("expires_at"),
        "status": row.get("status").and_then(Value::as_str).unwrap_or("ACTIVE"),
        "autoRenew": row.get("auto_renew").and_then(Value::as_bool).unwrap_or(false),
        "cancelledAt": row.get("cancelled_at").filter(|v| !v.is_null())
    })).collect::<Vec<_>>();
    let history = payment_rows.iter().map(|row| json!({
        "reference": row.get("reference").and_then(Value::as_str).unwrap_or_default(),
        "product": row.get("product").and_then(Value::as_str).unwrap_or_default(),
        "planCode": row.get("plan_code").and_then(Value::as_str).unwrap_or_default(),
        "amount": row_number(row, "amount", 0.0),
        "currency": row.get("currency").and_then(Value::as_str).unwrap_or("NGN"),
        "status": row.get("status").and_then(Value::as_str).unwrap_or_default(),
        "startsAt": row.get("starts_at").filter(|v| !v.is_null()),
        "expiresAt": row.get("expires_at").filter(|v| !v.is_null()),
        "createdAt": row.get("created_at"),
        "paidAt": row.get("paid_at").filter(|v| !v.is_null())
    })).collect::<Vec<_>>();
    (
        StatusCode::OK,
        Json(json!({
            "success": true,
            "provider": provider_config(),
            "businessSubscriptions": business_subscriptions,
            "verifiedPlusSubscriptions": verified_subscriptions,
            "payments": history,
            "schemaReady": schema_ready
        })),
    ).into_response()
}

pub async fn premium_benefits(State(state): State<AppState>) -> Response {
    let rows = select_rows(&state, "membership_plan_benefits", &[
        ("select".into(), "id,plan_code,label,description,included,sort_order,active".into()),
        ("active".into(), "eq.true".into()),
        ("order".into(), "plan_code.asc,sort_order.asc".into()),
    ]).await.unwrap_or_default();
    let benefits = rows.iter().map(|row| json!({
        "id": row.get("id"),
        "planCode": row.get("plan_code"),
        "label": row.get("label"),
        "description": row.get("description"),
        "included": row.get("included").and_then(Value::as_bool).unwrap_or(false),
        "sortOrder": row.get("sort_order"),
        "active": row.get("active").and_then(Value::as_bool).unwrap_or(false)
    })).collect::<Vec<_>>();
    (StatusCode::OK, Json(json!({ "success": true, "benefits": benefits }))).into_response()
}
