#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <Wire.h>
#include "MAX30105.h"
#include "heartRate.h"
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// --- MAX30105 Heart Rate Sensor ---
MAX30105 particleSensor;
const byte RATE_SIZE = 4;
byte rates[RATE_SIZE];
byte rateSpot = 0;
long lastBeat = 0;
float beatsPerMinute;
int beatAvg = 0;

// --- MPU6050 ---
Adafruit_MPU6050 mpu;

// --- OLED ---
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// --- Button ---
#define BUTTON_PIN 25
unsigned long lastButtonPress = 0;
const unsigned long debounceDelay = 300;

// --- Modes ---
enum Mode {
  HR_ONLY,
  BICEP_CURL,
  LATERAL_RAISE,
  SQUAT
};
Mode currentMode = HR_ONLY;

// --- Rep Counting ---
enum RepState { RESTING, LIFTING, LOWERING };
RepState repState = RESTING;
int repCount = 0;

// --- Thresholds ---
const float BICEP_CURL_START_ANGLE = 140.0; 
const float BICEP_CURL_END_ANGLE = 50.0;   
const float LATERAL_RAISE_START_ANGLE = 15.0;
const float LATERAL_RAISE_END_ANGLE = 80.0; 
const float SQUAT_START_ANGLE = 5.0;      
const float SQUAT_END_ANGLE = 75.0;   

// --- Animation ---
unsigned long lastAnimationTime = 0;
const unsigned long animationDuration = 100; // How long the big heart shows

// --- Heart Icons (Bitmap data) ---
static const unsigned char PROGMEM logo2_bmp[] = // Small heart
{ 0x03, 0xC0, 0xF0, 0x06, 0x71, 0x8C, 0x0C, 0x1B, 0x06, 0x18, 0x0E, 0x02, 0x10, 0x0C, 0x03, 0x10,
  0x04, 0x01, 0x10, 0x04, 0x01, 0x10, 0x40, 0x01, 0x10, 0x40, 0x01, 0x10, 0xC0, 0x03, 0x08, 0x88,
  0x02, 0x08, 0xB8, 0x04, 0xFF, 0x37, 0x08, 0x01, 0x30, 0x18, 0x01, 0x90, 0x30, 0x00, 0xC0, 0x60,
  0x00, 0x60, 0xC0, 0x00, 0x31, 0x80, 0x00, 0x1B, 0x00, 0x00, 0x0E, 0x00, 0x00, 0x04, 0x00,  };

// --- ADDED THIS BITMAP for the pulse effect ---
static const unsigned char PROGMEM logo3_bmp[] = // Big heart
{ 0x01, 0xF0, 0x0F, 0x80, 0x06, 0x1C, 0x38, 0x60, 0x18, 0x06, 0x60, 0x18, 0x10, 0x01, 0x80, 0x08,
  0x20, 0x01, 0x80, 0x04, 0x40, 0x00, 0x00, 0x02, 0x40, 0x00, 0x00, 0x02, 0xC0, 0x00, 0x08, 0x03,
  0x80, 0x00, 0x08, 0x01, 0x80, 0x00, 0x18, 0x01, 0x80, 0x00, 0x1C, 0x01, 0x80, 0x00, 0x14, 0x00,
  0x80, 0x00, 0x14, 0x00, 0x80, 0x00, 0x14, 0x00, 0x40, 0x10, 0x12, 0x00, 0x40, 0x10, 0x12, 0x00,
  0x7E, 0x1F, 0x23, 0xFE, 0x03, 0x31, 0xA0, 0x04, 0x01, 0xA0, 0xA0, 0x0C, 0x00, 0xA0, 0xA0, 0x08,
  0x00, 0x60, 0xE0, 0x10, 0x00, 0x20, 0x60, 0x20, 0x06, 0x00, 0x40, 0x60, 0x03, 0x00, 0x40, 0xC0,
  0x01, 0x80, 0x01, 0x80, 0x00, 0xC0, 0x03, 0x00, 0x00, 0x60, 0x06, 0x00, 0x00, 0x30, 0x0C, 0x00,
  0x00, 0x08, 0x10, 0x00, 0x00, 0x06, 0x60, 0x00, 0x00, 0x03, 0xC0, 0x00, 0x00, 0x01, 0x80, 0x00  };


void setup() {
  Serial.begin(115200);
  delay(100);

  // --- OLED ---
  if(!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) { 
    Serial.println(F("SSD1306 allocation failed"));
    for(;;);
  }
  display.display();
  delay(1000);

  // --- MAX30105 ---
  if (!particleSensor.begin(Wire, I2C_SPEED_FAST)) {
    Serial.println("MAX30105 was not found. Please check wiring/power.");
    while (1);
  }
  particleSensor.setup();
  particleSensor.setPulseAmplitudeRed(0x0A);

  // --- MPU6050 ---
  if (!mpu.begin()) {
    Serial.println("Failed to find MPU6050 chip");
    while (1) delay(10);
  }
  mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
  mpu.setGyroRange(MPU6050_RANGE_500_DEG);
  mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
  delay(100);

  // --- Button ---
  pinMode(BUTTON_PIN, INPUT_PULLUP);
}

void loop() {
  // --- Button Mode Switch ---
  int buttonState = digitalRead(BUTTON_PIN);
  if (buttonState == LOW) {
    unsigned long currentTime = millis();
    if (currentTime - lastButtonPress > debounceDelay) {
      currentMode = static_cast<Mode>((currentMode + 1) % 4);
      repCount = 0;
      repState = RESTING;
      lastButtonPress = currentTime;
    }
  }

  // --- Read Heart Rate ---
  long irValue = particleSensor.getIR();

  if (irValue > 7000) { // Check for a finger first!
    bool beatDetected = checkForBeat(irValue);
    if (beatDetected) {
        // --- TRIGGER ANIMATION ---
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
  } else { // No finger is detected
    beatAvg = 0; // Reset the average so it doesn't show an old value
  }


  // --- Read MPU6050 for rep counting ---
  float angle = 0;
  if (currentMode != HR_ONLY) {
    sensors_event_t a, g, temp;
    mpu.getEvent(&a, &g, &temp);
    if (currentMode == LATERAL_RAISE) {
      angle = atan2(a.acceleration.y, a.acceleration.z) * 180 / PI;
      angle = abs(angle);
    } else {
      angle = atan2(-a.acceleration.x, sqrt(a.acceleration.y*a.acceleration.y + a.acceleration.z*a.acceleration.z)) * 180 / PI;
      angle = map(angle, -90, 90, 0, 180);
    }

    // Count reps
    switch (currentMode) {
      case BICEP_CURL:    processRep(angle, BICEP_CURL_START_ANGLE, BICEP_CURL_END_ANGLE, true); break;
      case LATERAL_RAISE: processRep(angle, LATERAL_RAISE_START_ANGLE, LATERAL_RAISE_END_ANGLE, false); break;
      case SQUAT:         processRep(angle, SQUAT_START_ANGLE, SQUAT_END_ANGLE, false); break;
      default: break;
    }
  }

  // --- Display ---
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);

  switch (currentMode) {
    case HR_ONLY:
      display.setCursor(0, 0); 
      display.println("Mode: Heart Rate");
      if (irValue < 7000) {
        display.setTextSize(1);
        display.setCursor(10, 25);
        display.println("Place finger on");
        display.setCursor(10, 35);
        display.println("the sensor.");
      } else {
        // --- MODIFIED DISPLAY LOGIC FOR ANIMATION ---
        if (millis() - lastAnimationTime < animationDuration) {
          // Show big heart on beat
          display.drawBitmap(2, 12, logo3_bmp, 32, 32, SSD1306_WHITE);
        } else {
          // Show small heart otherwise
          display.drawBitmap(5, 15, logo2_bmp, 24, 21, SSD1306_WHITE);
        }
        display.setTextSize(2);
        display.setCursor(50, 12);
        display.println("BPM");
        display.setCursor(50, 32);
        display.println(beatAvg);
      }
      break;
    case BICEP_CURL:
      display.setCursor(0, 0); display.println("Mode: Bicep Curl");
      display.setTextSize(2); display.setCursor(0, 30); display.print("Reps: "); display.println(repCount);
      break;
    case LATERAL_RAISE:
      display.setCursor(0, 0); display.println("Mode: Lateral Raise");
      display.setTextSize(2); display.setCursor(0, 30); display.print("Reps: "); display.println(repCount);
      break;
    case SQUAT:
      display.setCursor(0, 0); display.println("Mode: Squat");
      display.setTextSize(2); display.setCursor(0, 30); display.print("Reps: "); display.println(repCount);
      break;
  }

  // Display HR in exercise modes if a finger is present
  if (currentMode != HR_ONLY && irValue > 7000) {
    display.setTextSize(1);
    display.setCursor(80, 50);
    display.print("HR: "); 
    display.println(beatAvg);
  }

  display.display();
}

void processRep(float angle, float startThreshold, float endThreshold, bool inverted) {
  switch (repState) {
    case RESTING:
      if ((!inverted && angle > endThreshold) || (inverted && angle < endThreshold)) repState = LIFTING;
      break;
    case LIFTING:
      if ((!inverted && angle < startThreshold) || (inverted && angle > startThreshold)) repState = LOWERING;
      break;
    case LOWERING:
      if ((!inverted && angle > endThreshold) || (inverted && angle < endThreshold)) {
        repCount++;
        repState = RESTING;
      }
      break;
  }
}