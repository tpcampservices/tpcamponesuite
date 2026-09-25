/**
 * Customer-facing payment provider. PayPal code, data and settings are kept
 * (hidden, not deleted) so history stays readable and the gateway can return.
 */
export type PaymentProvider = "paywise" | "paypal";
export const CUSTOMER_PAYMENT_PROVIDER: PaymentProvider = "paywise";
export const PAYPAL_CHECKOUT_ENABLED = (CUSTOMER_PAYMENT_PROVIDER as PaymentProvider) === "paypal";
/** Phase 1: PayWise customer checkout is not live yet (sandbox infrastructure only). */
export const PAYWISE_CHECKOUT_ENABLED = false;
