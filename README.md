Project: AI-Assisted Fitness Tracking and AR Feedback System

This repository contains all components of the full system, including AI-based exercise form analysis, augmented reality visualization, inter-device communication, and embedded firmware for the wearable fitness tracker.

1. Repository Structure
ai/

Ultra96-based AI inference code.
Includes:

Pose estimation and form analysis

Pre-/post-processing pipelines

Model utilities and supporting scripts

AR/

Browser-based Augmented Reality (AR) web application.
Includes:

AR interface and overlays

Form correctness visualization

Health metric HUD

Networking to receive relay data

comms/

Communication middleware running on the relay laptop.
Handles:

WebSocket/TCP communication

Data routing between AI, AR, and the wearable

Synchronization and message formatting

hardware/

Embedded firmware and sensor code for the ESP32 fitness tracker.

Subfolders:

deprecated/
Old sensor test code and prototypes.

FitnessTracker/
Final production firmware for the ESP32, including:

MAX30102 heart rate sensing

MPU6050 motion + rep counting

SSD1306 OLED display

MAX17043 fuel gauge

BLE data transmission

2. System Overview

The project comprises four main subsystems:

1. Wearable Hardware

ESP32-based wrist-mounted device measuring:

Heart rate

Motion (rep counting)

Battery state (via MAX17043)
Sends telemetry wirelessly to the relay laptop via BLE.

2. AI Module (Ultra96)

Processes live video feed

Performs pose estimation

Detects exercise form correctness

Sends pose landmarks / form data to the relay

3. Communications Layer

Relay laptop runs the communication scripts:

Receives data from AI and wearable

Synchronizes time-stamped data streams

Forwards combined stream to AR application

4. AR Web Application

Displays real-time heart rate, reps, battery status

Overlays form analytics on video feed

Provides posture correctness indicators

Offers summary and visualization tools

3. Usage Notes

AI code must be executed on the Ultra96 environment.

AR application runs in the browser on the user’s phone.

Comms scripts run on the relay laptop and must be active for full-system operation.

ESP32 firmware is in hardware/FitnessTracker and should be flashed directly.

The hardware/deprecated folder is not part of the final build.

4. Contact

For system setup or repository structure questions, please contact the project team.
