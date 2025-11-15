#include "display_handler.h"
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Wire.h>
#include "hr_sensor.h" // Needed for get_ir_value() and get_last_animation_time()

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

const unsigned long animationDuration = 100;

// --- Heart Icons (Bitmap data) ---
static const unsigned char PROGMEM logo2_bmp[] =
{ 0x03, 0xC0, 0xF0, 0x06, 0x71, 0x8C, 0x0C, 0x1B, 0x06, 0x18, 0x0E, 0x02, 0x10, 0x0C, 0x03, 0x10,
0x04, 0x01, 0x10, 0x04, 0x01, 0x10, 0x40, 0x01, 0x10, 0x40, 0x01, 0x10, 0xC0, 0x03, 0x08, 0x88,
0x02, 0x08, 0xB8, 0x04, 0xFF, 0x37, 0x08, 0x01, 0x30, 0x18, 0x01, 0x90, 0x30, 0x00, 0xC0, 0x60,
0x00, 0x60, 0xC0, 0x00, 0x31, 0x80, 0x00, 0x1B, 0x00, 0x00, 0x0E, 0x00, 0x00, 0x04, 0x00,  };
static const unsigned char PROGMEM logo3_bmp[] =
{ 0x01, 0xF0, 0x0F, 0x80, 0x06, 0x1C, 0x38, 0x60, 0x18, 0x06, 0x60, 0x18, 0x10, 0x01, 0x80, 0x08,
0x20, 0x01, 0x80, 0x04, 0x40, 0x00, 0x00, 0x02, 0x40, 0x00, 0x00, 0x02, 0xC0, 0x00, 0x08, 0x03,
0x80, 0x00, 0x08, 0x01, 0x80, 0x00, 0x18, 0x01, 0x80, 0x00, 0x1C, 0x01, 0x80, 0x00, 0x14, 0x00,
0x80, 0x00, 0x14, 0x00, 0x80, 0x00, 0x14, 0x00, 0x40, 0x10, 0x12, 0x00, 0x40, 0x10, 0x12, 0x00,
0x7E, 0x1F, 0x23, 0xFE, 0x03, 0x31, 0xA0, 0x04, 0x01, 0xA0, 0xA0, 0x0C, 0x00, 0xA0, 0xA0, 0x08,
0x00, 0x60, 0xE0, 0x10, 0x00, 0x20, 0x60, 0x20, 0x06, 0x00, 0x40, 0x60, 0x03, 0x00, 0x40, 0xC0,
0x01, 0x80, 0x01, 0x80, 0x00, 0xC0, 0x03, 0x00, 0x00, 0x60, 0x06, 0x00, 0x00, 0x30, 0x0C, 0x00,
0x00, 0x08, 0x10, 0x00, 0x00, 0x06, 0x60, 0x00, 0x00, 0x03, 0xC0, 0x00, 0x00, 0x01, 0x80, 0x00 };


void setup_display() {
  if(!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) { 
    Serial.println(F("SSD1306 allocation failed"));
    for(;;);
  }
  display.display();
  delay(1000);
}

void draw_countdown(unsigned long startTime) {
    display.setTextSize(2); display.setCursor(10, 20); display.println("Get Ready");
    const unsigned long startDelay = 5000;
    int countdown = (startDelay - (millis() - startTime)) / 1000;
    display.setTextSize(3); display.setCursor(55, 40); display.println(countdown + 1);
}

void draw_reps(int repCount) {
    display.setTextSize(2); display.setCursor(0, 30); display.print("Reps: "); display.println(repCount);
}

void update_display(Mode currentMode, int beatAvg, int repCount, bool exerciseStarted, unsigned long exerciseModeStartTime, int batteryPercent) {
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    
    // Display Battery Percentage on Top Right
    display.setCursor(100, 0); 
    display.print(batteryPercent);
    display.print("%");
    display.setCursor(0, 0); // Reset cursor

    long irValue = get_ir_value();

    switch (currentMode) {
      case HR_ONLY:
        display.println("Mode: HR Only");
        if (irValue < 7000) {
          int16_t x1, y1;
          uint16_t w, h;

          const char* line1 = "Place device";
          display.getTextBounds(line1, 0, 0, &x1, &y1, &w, &h);
          display.setCursor((SCREEN_WIDTH - w) / 2, 25);
          display.println(line1);

          const char* line2 = "on wrist";
          display.getTextBounds(line2, 0, 0, &x1, &y1, &w, &h);
          // Position 10px below the first line (8px font + 2px padding)
          display.setCursor((SCREEN_WIDTH - w) / 2, 35); 
          display.println(line2);
        } else {
          if (millis() - get_last_animation_time() < animationDuration) {
            display.drawBitmap(2, 12, logo3_bmp, 32, 32, SSD1306_WHITE);
          } else {
            display.drawBitmap(5, 15, logo2_bmp, 24, 21, SSD1306_WHITE);
          }
          display.setTextSize(2);
          display.setCursor(50, 12); display.println("BPM");
          display.setCursor(50, 32); display.println(beatAvg);
        }
        break;

      case BICEP_CURL:
        display.println("Mode: Bicep Curl");
        if (exerciseStarted) draw_reps(repCount); else draw_countdown(exerciseModeStartTime);
        break;

      case LATERAL_RAISE:
        display.println("Mode: Lat Raise");
        if (exerciseStarted) draw_reps(repCount); else draw_countdown(exerciseModeStartTime);
        break;
        
      case SQUAT:
        display.println("Mode: Squat");
        if (exerciseStarted) draw_reps(repCount); else draw_countdown(exerciseModeStartTime);
        break;
    }

    // Show HR in the bottom right corner during exercises
    if (currentMode != HR_ONLY && irValue > 7000) {
      display.setTextSize(1);
      display.setCursor(80, 50);
      display.print("HR: "); display.println(beatAvg);
    }

    display.display();
}