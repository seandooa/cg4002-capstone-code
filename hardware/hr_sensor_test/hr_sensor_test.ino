#include <Wire.h>
#include <MAX3010x.h>
#include "filters.h"

MAX30105 sensor;

// -------------------- HR VARIABLES --------------------
const auto kSamplingRate = sensor.SAMPLING_RATE_400SPS;
const float kSamplingFrequency = 400.0;

LowPassFilter low_pass_filter_red(5.0, kSamplingFrequency);
HighPassFilter high_pass_filter(0.2, kSamplingFrequency); // lower cutoff to preserve small wrist pulses
Differentiator differentiator(kSamplingFrequency);
MinMaxAvgStatistic stat_red;

const unsigned long kFingerCooldownMs = 200;
const float kEdgeThreshold = -1000; // smaller threshold for weak wrist pulses
long last_heartbeat = 0;
long finger_timestamp = 0;
bool finger_detected = false;

int latest_bpm = 0;

void setup() {
  Serial.begin(115200);
  Wire.begin();

  if (!sensor.begin() || !sensor.setSamplingRate(kSamplingRate)) {
    Serial.println("MAX3010x not found!");
    while(1);
  }

  Serial.println("HR sensor ready for wrist test!");
}

void loop() {
  static unsigned long lastHRTime = 0;
  unsigned long now = millis();

  if(now - lastHRTime >= 2){
    lastHRTime = now;
    auto sample = sensor.readSample(0);
    float red = sample.red;

    // Lowered threshold for wrist detection
    if(red>3000){  
      if(now - finger_timestamp > kFingerCooldownMs) finger_detected=true;
    } else {
      differentiator.reset();
      low_pass_filter_red.reset();
      high_pass_filter.reset();
      stat_red.reset();
      finger_detected=false;
      finger_timestamp=now;
    }

    if(finger_detected){
      red = low_pass_filter_red.process(red);
      stat_red.process(red);

      float current_val = high_pass_filter.process(red);
      float current_diff = differentiator.process(current_val);

      static float last_diff_local = NAN;
      static bool crossed_local=false;
      static long crossed_time_local=0;

      if(!isnan(current_diff) && !isnan(last_diff_local)){
        if(last_diff_local>0 && current_diff<0){
          crossed_local=true;
          crossed_time_local=now;
        }
        if(current_diff>0) crossed_local=false;

        if(crossed_local && current_diff<kEdgeThreshold){
          if(last_heartbeat!=0 && crossed_time_local - last_heartbeat > 300){
            int bpm = 60000 / (crossed_time_local - last_heartbeat);
            if(bpm>30 && bpm<200){
              latest_bpm = bpm;
              Serial.println("BPM: " + String(latest_bpm));
            }
            stat_red.reset();
          }
          crossed_local=false;
          last_heartbeat = crossed_time_local;
        }
      }
      last_diff_local=current_diff;
    }
  }

  delay(1);
}
