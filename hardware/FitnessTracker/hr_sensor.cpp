#include "hr_sensor.h"
#include <Wire.h>
#include "MAX30105.h"
#include "heartRate.h"

// --- MAX30105 Heart Rate Sensor ---
MAX30105 particleSensor;
const byte RATE_SIZE = 4;
byte rates[RATE_SIZE];
byte rateSpot = 0;
long lastBeat = 0;
float beatsPerMinute;
int beatAvg = 0;
long irValue = 0;
unsigned long lastAnimationTime = 0;

void setup_hr_sensor() {
  if (!particleSensor.begin(Wire, I2C_SPEED_FAST)) {
    Serial.println("MAX30105 was not found.");
    while (1);
  }
  particleSensor.setup();
  particleSensor.setPulseAmplitudeRed(0x0A);
}

void update_hr_sensor() {
  irValue = particleSensor.getIR();
  if (irValue > 7000) {
    if (checkForBeat(irValue)) {
        lastAnimationTime = millis();
        long delta = millis() - lastBeat;
        lastBeat = millis();
        beatsPerMinute = 60 / (delta / 1000.0);

        if (beatsPerMinute > 20 && beatsPerMinute < 255) {
            rates[rateSpot++] = (byte)beatsPerMinute;
            rateSpot %= RATE_SIZE;
            beatAvg = 0;
            for (byte x = 0; x < RATE_SIZE; x++) beatAvg += rates[x];
            beatAvg /= RATE_SIZE;
        }
    }
  } else {
    beatAvg = 0;
  }
}

int get_beat_avg() {
  return beatAvg;
}

long get_ir_value() {
  return irValue;
}

unsigned long get_last_animation_time(){
  return lastAnimationTime;
}