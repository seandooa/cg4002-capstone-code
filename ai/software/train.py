import torch
import torch.optim as optim
import os
import torch.nn as nn
import numpy as np
from torch.utils.data import DataLoader

from preprocessingv2 import preprocessing
from nn_models.NN import NN


'''
until it hits the criteria, it should be red
side view - bicep curls: tucked in and perpendicular elbows, + no leaning, rep is only counted if elbows are bent beyond 90 degrees, 
side view - squats: 90 degrees, knees shoulder width apart + little bit of allowance, dont lean forward / tiptoe, 
front view - lateral raises:  shoulder height, arms slightly bent, no leaning forward / backward
'''

BATCH_SIZE = 16
LEARNING_RATE = 0.01
EPOCH_FOLDER_DIR = "epochs"
EPOCH_FILEPATH = "" 
NUM_EPOCHS = 150

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
    
    NN_model = NN().to(device)
    if (epoch_filepath != ""):
        NN_model.load_state_dict(torch.load(epoch_filepath, map_location=device))
        

     #instantiating other variables
    optimizer = create_optimizer(NN_model, "Adam", LEARNING_RATE) #try rmsprop? adamw?
    loss_function = nn.BCEWithLogitsLoss()

    for epoch in range(num_epochs):
        #training loop
        NN_model.train()
        training_loss = 0.0
        num_batches = 0
        for poseData, labels in train_dataloader:
            poseData = poseData.to(torch.float32).to(device)
            labels = labels.to(torch.float32).to(device)

            logits = NN_model(poseData).squeeze(1)
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
            for poseData, labels  in eval_dataloader:
                poseData = poseData.to(torch.float32).to(device)
                labels = labels.to(torch.float32).to(device)

                logits = NN_model(poseData).squeeze(1)
                loss = loss_function(logits, labels)

                num_batches+=1
                eval_loss += loss.item()
        
        avg_eval_loss = eval_loss / num_batches
        print(f'Epoch [{epoch+1}/{num_epochs}], Validation Loss: {avg_eval_loss:.4f}')
    
    
if __name__ == "__main__":
    
    #data preprocessing
    print("\n>>> Processing and loading training data ...")
    train_dataloader, eval_dataloader = preprocessing(csv_filePath="combined.csv", batch_size=BATCH_SIZE, isTraining=True)

    #actual training loop
    training(train_dataloader=train_dataloader, eval_dataloader=eval_dataloader, epoch_folder_path=EPOCH_FOLDER_DIR, epoch_filepath=EPOCH_FILEPATH,  num_epochs=NUM_EPOCHS)