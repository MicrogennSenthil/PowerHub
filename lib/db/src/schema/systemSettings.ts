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
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type SystemSettingsRow = typeof systemSettingsTable.$inferSelect;
