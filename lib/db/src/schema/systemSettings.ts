import {
  pgTable,
  integer,
  text,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

// Global singleton (id = 1) holding system-wide device-communication config.
// Phase 1 runs the legacy HTTP-poll protocol; the MQTT fields are stored now so
// the device layer can switch over later without another schema change.
export const systemSettingsTable = pgTable("system_settings", {
  id: integer("id").primaryKey(),
  deviceProtocol: text("device_protocol").notNull().default("legacy"),
  offlineThresholdMinutes: integer("offline_threshold_minutes")
    .notNull()
    .default(2),
  pollIntervalSeconds: integer("poll_interval_seconds").notNull().default(10),
  mqttBrokerUrl: text("mqtt_broker_url"),
  mqttPort: integer("mqtt_port"),
  mqttUsername: text("mqtt_username"),
  mqttPassword: text("mqtt_password"),
  mqttBaseTopic: text("mqtt_base_topic"),
  mqttUseTls: boolean("mqtt_use_tls").notNull().default(false),
  // Branding shown on the login/splash screen and the castable TV welcome page.
  // brandLogoUrl holds a data URL (small, downscaled PNG) so no object storage
  // is needed; brandColor is the background for the welcome screen.
  brandName: text("brand_name"),
  brandColor: text("brand_color"),
  brandLogoUrl: text("brand_logo_url"),
  // Property code generation: "manual" lets the admin type a code, "auto"
  // generates a unique sequential code from propertyCodePrefix on create.
  propertyCodeMode: text("property_code_mode").notNull().default("manual"),
  propertyCodePrefix: text("property_code_prefix").notNull().default("PROP"),
  // Email alert configuration — used to notify admins when a device goes offline.
  smtpHost: text("smtp_host"),
  smtpPort: integer("smtp_port").default(587),
  smtpUser: text("smtp_user"),
  smtpPassword: text("smtp_password"),
  smtpFrom: text("smtp_from"),
  alertEmailEnabled: boolean("alert_email_enabled").notNull().default(false),
  alertOfflineMinutes: integer("alert_offline_minutes").notNull().default(10),
  // WhatsApp OTP delivery via mwhatsapp platform
  waApiUrl: text("wa_api_url"),
  waApiKey: text("wa_api_key"),
  waPhoneNumberId: text("wa_phone_number_id"),
  waOtpEnabled: boolean("wa_otp_enabled").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type SystemSettingsRow = typeof systemSettingsTable.$inferSelect;
