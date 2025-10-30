#include "config.h"
#include "hr_sensor.h"
#include "imu_handler.h"
#include "display_handler.h"
#include "ble_handler.h"
#include "battery_monitor.h"

// --- Global State ---
Mode currentMode = HR_ONLY;
unsigned long lastButtonPress = 0;
const unsigned long debounceDelay = 300;

// --- Exercise Start Logic ---
unsigned long exerciseModeStartTime = 0;
bool exerciseStarted = false;
const unsigned long startDelay = 5000; // 5 seconds

void setup() {
  Serial.begin(115200);
  delay(100);

  // Initialize all hardware modules
  setup_display();
  setup_hr_sensor();
  setup_imu();
  setup_battery();
  setup_ble();

  // --- Button Init ---
  pinMode(BUTTON_PIN, INPUT_PULLUP);

  Serial.println("Fitness Tracker Initialized.");
}

void loop() {
  // --- Button Mode Switch ---
  if (digitalRead(BUTTON_PIN) == LOW) {
    if (millis() - lastButtonPress > debounceDelay) {
      currentMode = static_cast<Mode>((currentMode + 1) % 4);
      reset_reps();
      lastButtonPress = millis();
      
      exerciseStarted = false; 
      if (currentMode != HR_ONLY) {
          exerciseModeStartTime = millis(); 
      }
    }
  }

  // --- Update all sensors and handlers ---
  update_hr_sensor();
  update_battery();

  // --- Check if exercise should be marked as "started" ---
  if (currentMode != HR_ONLY && !exerciseStarted) {
    if (millis() - exerciseModeStartTime > startDelay) {
      exerciseStarted = true;
    }
  }

  // --- Update Rep Counter if in an exercise mode ---
  if (currentMode != HR_ONLY && exerciseStarted) {
    update_rep_counter(currentMode);
  }

  // --- Get latest data from modules ---
  int currentHR = get_beat_avg();
  int currentReps = get_rep_count();
  int currentBattery = get_battery_percent();
  
  // --- Update OLED Display ---
  update_display(currentMode, currentHR, currentReps, exerciseStarted, exerciseModeStartTime, currentBattery);

  // --- Update BLE ---
  send_ble_data(currentMode, currentHR, currentReps, exerciseStarted);
}