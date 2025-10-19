package billing

import (
    "bytes"
    "encoding/json"
    "net/http"
    "strings"
)

type CreateIntentRequest struct {
    AmountCents int64  `json:"amount_cents"`
    Currency    string `json:"currency"`
    Description string `json:"description"`
    Provider    string `json:"provider"`
}

type CreateIntentResponse struct {
    Success bool        `json:"success"`
    Message string      `json:"message"`
    Data    interface{} `json:"data"`
}

// CreatePaymentIntent proxies to Core API billing to initiate a payment flow.
// It forwards Authorization and cookies for user identification.
func CreatePaymentIntent(coreAPIBase string, r *http.Request, payload CreateIntentRequest) (*CreateIntentResponse, int, error) {
    apiURL := strings.TrimRight(coreAPIBase, "/") + "/v1/billing/payment-intents"
    buf, _ := json.Marshal(payload)
    req, _ := http.NewRequest(http.MethodPost, apiURL, bytes.NewReader(buf))
    req.Header.Set("Content-Type", "application/json")
    if authz := r.Header.Get("Authorization"); authz != "" { req.Header.Set("Authorization", authz) }
    if cookie := r.Header.Get("Cookie"); cookie != "" { req.Header.Set("Cookie", cookie) }
    if origin := r.Header.Get("Origin"); origin != "" { req.Header.Set("Origin", origin) }

    resp, err := http.DefaultClient.Do(req)
    if err != nil { return nil, 0, err }
    defer resp.Body.Close()
    var out CreateIntentResponse
    _ = json.NewDecoder(resp.Body).Decode(&out)
    return &out, resp.StatusCode, nil
}

