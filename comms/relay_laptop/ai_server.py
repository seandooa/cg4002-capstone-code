#pass through CNN layers
#determine the kernel size and maxpooling
#pass through linear layers

import cv2
import subprocess
import time
import base64
import os
import struct
import socket

# from obswebsocket import obsws, requests, exceptions

import torch
import numpy as np
from ultralytics import YOLO
from torch.utils.data import DataLoader

from yolo_preprocessing import preprocessing

OBS_HOST = "localhost"
OBS_PORT = 4455  # your WebSocket port
OBS_PASSWORD = ""  # empty string if none
SOURCE_NAME = "Browser"  # the name of the source in OBS
OUTPUT_DIR = "images"
INTERVAL_SEC = 0.1  # take a screenshot every 1 seconds

'''
bicep curls: tucked in and perpendicular elbows, + no leaning
squats: 90 degrees, knees shoulder width apart + little bit of allowance, dont lean forward / tiptoe,
lateral raises:  
'''

BATCH_SIZE = 64
POSE_MODEL = "models/yolo11n-pose.pt"
device = torch.device("cpu") # torch.device("mps" if torch.backends.mps.is_available() and torch.backends.mps.is_built() else "cpu")
poseModel = YOLO(POSE_MODEL).to(device)

BICEP_CURLS_KEYPOINTS = [5, 6, 7, 8, 9, 10]
BICEP_CURL_EDGES = [(5,7), (7,9), (6,8), (8,10), (5,6)]

SQUATS_KEYPOINTS = [11, 12, 13, 14, 15, 16]
SQUAT_EDGES = [(11,13), (13,15), (12,14), (14,16), (11,12)]

LATERAL_RAISE_KEYPOINTS = [5,6,7,8,9,10,11,12]
LATERAL_RAISE_EDGES = [(5,7),(7,9),(6,8),(8,10),(5,6),(11,12),(5,11),(6,12)]

KEYPOINTS = [BICEP_CURLS_KEYPOINTS, SQUATS_KEYPOINTS, LATERAL_RAISE_KEYPOINTS]
EDGES = [BICEP_CURL_EDGES, SQUAT_EDGES, LATERAL_RAISE_EDGES]

def list_avfoundation_devices():
    """
    Use ffmpeg to list avfoundation devices, capturing their indexes and unique IDs.
    Returns a list of dicts: { 'index': int, 'name': str, 'unique_id': str }
    """
    cmd = ["ffmpeg", "-f", "avfoundation", "-list_devices", "true", "-i", ""]
    # ffmpeg outputs the device list to stderr
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    lines = proc.stderr.splitlines()
    for line in lines:
        print(line)

list_avfoundation_devices()
index = input()
cap = cv2.VideoCapture(int(index), cv2.CAP_AVFOUNDATION)
print("Connected to VirtualCam")

def process_array(results, exercises):
    poses = []

    for i, res in enumerate(results):  # iterate over batch
        if len(res.boxes) == 0:
            continue

        exercise = int(exercises[i].item() - 1)

        # Pick main subject (largest bbox)
        areas = (res.boxes.xyxy[:,2] - res.boxes.xyxy[:,0]) * (res.boxes.xyxy[:,3] - res.boxes.xyxy[:,1])
        main_idx = torch.argmax(areas)
        pose_estimates = res.keypoints.data[main_idx].cpu().numpy()  # (num_keypoints, 3)

        # Zero out irrelevant points
        keypoints = KEYPOINTS[exercise]
        mask = np.ones(len(pose_estimates), dtype=bool)
        mask[keypoints] = False
        pose_estimates[mask] = [0, 0, 0]

        # Flatten and append exercise ID
        flattened = pose_estimates.flatten()
        flattened = np.concatenate([flattened, [exercise]])
        poses.append(torch.tensor(flattened, dtype=torch.float32))

    if not poses:
        return None

    return torch.stack(poses)   # shape (batch_size, feature_dim)

def yolo_inference(imageList: list, pose_model):
    inference_dataloader = preprocessing(imageList=imageList, batchSize=BATCH_SIZE)
    result = []
    
    with torch.inference_mode():
        for batch in inference_dataloader:
            inputs, exercises = batch
            inputs = inputs.to(torch.float32).to(device)
            results = pose_model(inputs, verbose=False)

            resized_array = process_array(results, exercises)
            result.append(resized_array)
    return result

def main():
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(path)
    #ws = obsws(OBS_HOST, OBS_PORT, OBS_PASSWORD)
    #try:
    #    ws.connect()
    #except exceptions.ConnectionFailure as e:
    #    print("Failed to connect to OBS WebSocket:", e)
    #    return

    #print("Connected to OBS WebSocket")

    try:
        while True:
            # Get new image from OBS and save to /images



            #resp = ws.call(requests.GetSourceScreenshot(
            #    sourceName=SOURCE_NAME,
            #    imageFormat="png",
            #    imageCompressionQuality=100
            #))
            #b64 = resp.getImageData()
            #if b64.startswith("data:image"):
            #    b64 = b64.split(",", 1)[1]
            #img_bytes = base64.b64decode(b64)
            fname = "e1_1.png"
            fpath = os.path.join(OUTPUT_DIR, fname)
            #with open(fpath, "wb") as f:
            #    f.write(img_bytes)


            ret, frame = cap.read()
            if not ret:
                break
            # process frame
            print(frame.shape)
            cv2.imwrite(fpath, frame)

            print(f"Saved screenshot to {fpath}")

            # Run YOLO on the saved image
            now = time.time_ns() / 1000000000
            results = yolo_inference(["images/e1_1.png"], poseModel)
            print("inference takes", time.time_ns()/1000000000-now)
            if results[0] is not None:
                # Send results to relay server
                raw_array = np.array(results[0][0]).tolist()
                fmt = '<' + ('f' * 52)
                packed = struct.pack(fmt, *raw_array)
                print("\n")
                print(raw_array)
                print("\n")
                s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                s.connect(("127.0.0.1", 5556))
                s.send(packed)
            else:
                print("yolo_inference returned None")

            # Wait for a while and then remove the saved image
            # time.sleep(INTERVAL_SEC)
            os.remove(fpath);
            print(f"Removed {fpath}");

    except KeyboardInterrupt:
        print("Stopping screenshot loop")

    finally:
        cap.release()
        print("Disconnected from VirtualCam")

if __name__ == "__main__":
    main()
