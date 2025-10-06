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
from models.NN import NN

'''
bicep curls: tucked in and perpendicular elbows, + no leaning
squats: 90 degrees, knees shoulder width apart + little bit of allowance, dont lean forward / tiptoe,
lateral raises:  
'''

BATCH_SIZE = 16 
LEARNING_RATE = 0.0001
EPOCH_FOLDER_DIR = "epochs"
EPOCH_FILEPATH = "" 
NUM_EPOCHS = 30
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

        exercise = int(exercises[i])

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


def create_optimizer(model, optimizer_name='RMSprop', learning_rate=LEARNING_RATE, **kwargs):
    optimizer_class = getattr(optim, optimizer_name, None)
    if optimizer_class is None:
        raise ValueError(f"Unsupported optimizer: {optimizer_name}")
  
    kwargs['lr'] = learning_rate
    kwargs['weight_decay'] = 1e-4
  
    optimizer = optimizer_class(model.parameters(), **kwargs)
    return optimizer

def training(train_dataloader: DataLoader, eval_dataloader: DataLoader, epoch_folder_path: str, epoch_filepath: str,  num_epochs: int):
    device = torch.device("mps" if torch.backends.mps.is_available() and torch.backends.mps.is_built() else "cpu")
    
    pose_model = YOLO(POSE_MODEL)
    NN_model = NN().to(device)

     #instantiating other variables
    optimizer = create_optimizer(NN_model, "Adam", LEARNING_RATE)
    loss_function = nn.BCEWithLogitsLoss()

    for epoch in range(num_epochs):
        
        #training loop
        NN_model.train()
        training_loss = 0.0
        num_batches = 0
        for batch in train_dataloader:
            inputs, exercises, labels = batch
            inputs = inputs.to(torch.float32).to(device)
            results = pose_model(inputs, verbose=False)

            resized_array, labels = process_array(results, exercises, labels)
            resized_array = resized_array.to(torch.float32).to(device)
            labels = labels.to(torch.float32).to(device)
            logits = NN_model(resized_array).squeeze(1)
            loss = loss_function(logits, labels)

            optimizer.zero_grad()
            loss.backward()
            optimizer.step() 

            num_batches+=1
            training_loss += loss.item()

        avg_train_loss = training_loss / num_batches
        model_path = os.path.join(epoch_folder_path, f'model_epoch_{epoch+1}.pt')
        torch.save(NN_model.state_dict(), model_path)
        print(f'Epoch [{epoch+1}/{num_epochs}], Training Loss: {avg_train_loss:.4f}')
        
        #evaluation loop
        NN_model.eval()
        eval_loss = 0.0
        num_batches = 0
        with torch.inference_mode():
            for batch in eval_dataloader:
                inputs, exercises, labels = batch
                inputs = inputs.to(torch.float32).to(device)
                results = pose_model(inputs, verbose=False)

                resized_array, labels = process_array(results, exercises, labels)
                resized_array = resized_array.to(torch.float32).to(device)
                labels = labels.to(torch.float32).to(device)
                logits = NN_model(resized_array).squeeze(1)
                loss = loss_function(logits, labels)

                num_batches+=1
                eval_loss += loss.item()
        
        avg_eval_loss = eval_loss / num_batches
        print(f'Epoch [{epoch+1}/{num_epochs}], Validation Loss: {avg_eval_loss:.4f}')
    
    
if __name__ == "__main__":
    
    #data preprocessing
    print("\n>>> Processing and loading training data ...")
    train_dataloader = preprocessing(csv_filePath="training.csv", batch_size=BATCH_SIZE)
    print(">>> Processing and loading validation data ...")
    eval_dataloader = preprocessing(csv_filePath="validation.csv", batch_size=BATCH_SIZE)

    #actual training loop
    training(train_dataloader=train_dataloader, eval_dataloader=eval_dataloader, epoch_folder_path=EPOCH_FOLDER_DIR, epoch_filepath=EPOCH_FILEPATH,  num_epochs=NUM_EPOCHS)