import torch
import numpy as np
from ultralytics import YOLO
from torch.utils.data import DataLoader

from yolo_preprocessing import preprocessing

'''
bicep curls: tucked in and perpendicular elbows, + no leaning
squats: 90 degrees, knees shoulder width apart + little bit of allowance, dont lean forward / tiptoe,
lateral raises:  
'''

BICEP_CURLS_KEYPOINTS = [5, 6, 7, 8, 9, 10]
BICEP_CURL_EDGES = [(5,7), (7,9), (6,8), (8,10), (5,6)]

SQUATS_KEYPOINTS = [11, 12, 13, 14, 15, 16]
SQUAT_EDGES = [(11,13), (13,15), (12,14), (14,16), (11,12)]

LATERAL_RAISE_KEYPOINTS = [5,6,7,8,9,10,11,12]
LATERAL_RAISE_EDGES = [(5,7),(7,9),(6,8),(8,10),(5,6),(11,12),(5,11),(6,12)]

KEYPOINTS = [BICEP_CURLS_KEYPOINTS, SQUATS_KEYPOINTS, LATERAL_RAISE_KEYPOINTS]
EDGES = [BICEP_CURL_EDGES, SQUAT_EDGES, LATERAL_RAISE_EDGES]

BATCH_SIZE = 64
POSE_MODEL = "models/yolo11n-pose.pt"
device = torch.device("mps" if torch.backends.mps.is_available() and torch.backends.mps.is_built() else "cpu")
poseModel = YOLO(POSE_MODEL).to(device)

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

if __name__ == "__main__":
    yolo_inference(["images/e1_1.png", "images/e3_2.png"], poseModel)