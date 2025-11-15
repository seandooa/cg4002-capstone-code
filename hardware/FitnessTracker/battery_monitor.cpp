#include "battery_monitor.h"
#include <Arduino.h>
#include "MAX17043.h"

int batteryPercent = 0;
unsigned long lastBatteryReadTime = 0;
const unsigned long batteryReadInterval = 2000; // Read battery every 2 seconds

void setup_battery() {
  Serial.println("Initializing MAX17043...");
 
  if (FuelGauge.begin()) {
    Serial.println("MAX17043 detected.");
    FuelGauge.reset();
    delay(200);
  } else {
    Serial.println("MAX17043 not found. Check I2C wiring/address.");
    while (true);
  }
}

void update_battery() {
  if (millis() - lastBatteryReadTime > batteryReadInterval) {
    lastBatteryReadTime = millis();
    FuelGauge.quickstart();
    batteryPercent = FuelGauge.percent() / 2;
  }
}

int get_battery_percent() {
  return batteryPercent;
}