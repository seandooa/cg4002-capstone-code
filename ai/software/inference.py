#pass through CNN layers
#determine the kernel size and maxpooling
#pass through linear layers

import torch
import torch.optim as optim
import os
import torch.nn as nn
import numpy as np
from ultralytics import YOLO
from torch.utils.data import DataLoader

from preprocessing import preprocessing
from nn_models.NN import NN

'''
bicep curls: tucked in and perpendicular elbows, + no leaning
squats: 90 degrees, knees shoulder width apart + little bit of allowance, dont lean forward / tiptoe,
lateral raises:  
'''

BATCH_SIZE = 1
EPOCH_FOLDER_DIR = "epochs"
EPOCH_FILEPATH = "model_epoch_11.pt" 
POSE_MODEL = "models/yolo11n-pose.pt"

BICEP_CURLS_KEYPOINTS = [5, 6, 7, 8, 9, 10]
BICEP_CURL_EDGES = [(5,7), (7,9), (6,8), (8,10), (5,6)]

SQUATS_KEYPOINTS = [11, 12, 13, 14, 15, 16]
SQUAT_EDGES = [(11,13), (13,15), (12,14), (14,16), (11,12)]

LATERAL_RAISE_KEYPOINTS = [5,6,7,8,9,10,11,12]
LATERAL_RAISE_EDGES = [(5,7),(7,9),(6,8),(8,10),(5,6),(11,12),(5,11),(6,12)]

KEYPOINTS = [BICEP_CURLS_KEYPOINTS, SQUATS_KEYPOINTS, LATERAL_RAISE_KEYPOINTS]
EDGES = [BICEP_CURL_EDGES, SQUAT_EDGES, LATERAL_RAISE_EDGES]

def process_array(results, exercises, labels):
    poses = []
    llist = []

    for i, res in enumerate(results):  # iterate over batch
        if len(res.boxes) == 0:
            continue

        exercise = exercises[i]

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
        llist.append(labels[i])

    if not poses:
        return None, None

    return torch.stack(poses), torch.stack(llist)   # shape (batch_size, feature_dim)

def inference(inference_dataloader: DataLoader, epoch_folder_path: str, epoch_filepath: str):
    device = torch.device("mps" if torch.backends.mps.is_available() and torch.backends.mps.is_built() else "cpu")
    
    pose_model = YOLO(POSE_MODEL)
    NN_model = NN().to(device)
    if (epoch_filepath):
        print("epoch loaded")
        NN_model.load_state_dict(torch.load(f'{epoch_folder_path}/{epoch_filepath}', weights_only=True)) 
    NN_model.eval()

    total = 0
    correct= 0
    with torch.inference_mode():
        for batch in inference_dataloader:
            inputs, exercises, labels = batch
            inputs = inputs.to(torch.float32).to(device)
            results = pose_model(inputs, verbose=False)

            resized_array, labels = process_array(results, exercises, labels)
            resized_array = resized_array.to(torch.float32).to(device)
            labels = labels.to(torch.float32).to(device).item()
            logits = NN_model(resized_array)
            probabilities = torch.sigmoid(logits).item()
            print(resized_array[0], probabilities, labels)
            if ((probabilities > 0.5 and labels == 1.0) or (probabilities < 0.5 and labels == 0.0)):
                correct += 1
            total += 1
    print(f'{correct} / {total}')
    
if __name__ == "__main__":
    
    #data preprocessing
    print("\n>>> Processing and loading training data ...")
    inference_dataloader = preprocessing(csv_filePath="inference.csv", batch_size=BATCH_SIZE)

    #actual training loop
    inference(inference_dataloader=inference_dataloader, epoch_folder_path=EPOCH_FOLDER_DIR, epoch_filepath=EPOCH_FILEPATH)