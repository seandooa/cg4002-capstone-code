#pass through CNN layers
#determine the kernel size and maxpooling
#pass through linear layers

import torch
import torch.nn as nn
import numpy as np
import random

# Set the seed for reproducibility
seed = 42
torch.manual_seed(seed)
np.random.seed(seed)
random.seed(seed)
INPUT_SIZE = 34 + 22 + 3# 22 angles / distances + one hot encoded exercise type (3 types)

class NN(nn.Module):
    def __init__(self):
        super().__init__()
        self.l1 = nn.Linear(INPUT_SIZE, 32)
        self.l2 = nn.Linear(32, 16)
        self.l3 = nn.Linear(16, 1)

        self.leaky_relu = nn.LeakyReLU()
        self.dropout = nn.Dropout(p=0.2)

    
    def forward(self, x):
        x = self.l1(x)
        x = self.leaky_relu(x)
        x = self.dropout(x)

        x = self.l2(x)
        x = self.leaky_relu(x)
        x = self.dropout(x)

        x = self.l3(x)

        return x