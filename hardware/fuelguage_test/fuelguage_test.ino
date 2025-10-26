#include <Wire.h>
#include "MAX17043.h"  // https://github.com/porrey/max1704x

void setup() {
  Serial.begin(115200);
  Wire.begin();
  delay(250);

  Serial.println("Initializing MAX17043...");

  if (FuelGauge.begin()) {   // use 0x36 if your device responds there
    Serial.println("MAX17043 detected.");
    FuelGauge.reset();  // optional — clears config registers
    delay(200);
  } else {
    Serial.println("MAX17043 not found. Check I2C wiring/address.");
    while (true);
  }
}

void loop() {
  // --- must re-trigger quickstart before each reading ---
  FuelGauge.quickstart();
  delay(100); // allow time for fresh reading
  displayReading();
  delay(1000);
}

void displayReading()
{
  //
  // Get the voltage, battery percent
  // and other properties.
  //
  Serial.println("Device Reading:");
  Serial.print("Address:       0x"); Serial.println(FuelGauge.address(), HEX);
  Serial.print("Version:       "); Serial.println(FuelGauge.version());
  Serial.print("ADC:           "); Serial.println(FuelGauge.adc());
  Serial.print("Voltage:       "); Serial.print(FuelGauge.voltage()); Serial.println(" mV");
  Serial.print("Percent:       "); Serial.print(FuelGauge.percent() / 2); Serial.println("%");
  Serial.print("Is Sleeping:   "); Serial.println(FuelGauge.isSleeping() ? "Yes" : "No");
  Serial.print("Alert:         "); Serial.println(FuelGauge.alertIsActive() ? "Yes" : "No");
  Serial.print("Threshold:     "); Serial.print(FuelGauge.getThreshold()); Serial.println("%");
  Serial.print("Compensation:  0x"); Serial.println(FuelGauge.compensation(), HEX);
  Serial.println();
}
