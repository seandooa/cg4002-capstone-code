#include <cstdint>
#include <iostream>
#include <cstdlib>
#include <ctime>
#include "nn_inference.h"

#define INPUT_SIZE 59

// Function to run a single test case
void run_test(const float input_data[INPUT_SIZE], const char* test_name) {
    hls::stream<trans_pkt> in_stream;
    hls::stream<trans_pkt> out_stream;
    trans_pkt pkt;

    std::cout << std::fixed << std::setprecision(6);
    std::cout << test_name << ": ";

    f_int FIUnion;
    for (int i = 0; i < INPUT_SIZE; i++) {
        FIUnion.ft_version = input_data[i];
        pkt.data = FIUnion.int_version;
        pkt.last = (i == INPUT_SIZE - 1) ? 1 : 0;
        in_stream.write(pkt);
        std::cout << pkt.data << " ";
    }
    std::cout << std::endl;

    // Call the function under test
    nn_inference(in_stream, out_stream);

    // Read and print the output
    trans_pkt out_pkt = out_stream.read();
    FIUnion.int_version = out_pkt.data;

    std::cout << "NN Output: " << FIUnion.ft_version << std::endl;  
}


int main() {
    float test1[INPUT_SIZE] = {
        0.0000,  0.0000,  0.0000,  0.0000,  0.0000,  0.0000,  0.0000,  0.0000,  0.0000,  0.0000,  0.5433,  0.3445,  0.5234,  0.3275,  0.5032,  0.4734,  0.0000,  0.0000,  0.4358,  0.4028,  0.0000,  0.0000,  0.5208,  0.5954,  0.5047,  0.5836,  0.0000,  0.0000,  0.0000,  0.0000,  0.0000,  0.0000,  0.0000,  0.0000,  1.0000,  0.4855, -0.4674,  0.9777,  0.9973,  0.9960,  0.0000,  0.0000,  0.0000,  0.0000,  0.0000,  0.0000,  0.0000,  0.0000,  0.0000,  0.0000,  0.0000,  0.0000,  0.0000,  0.0000,  0.0000,  0.0000,  1.0000,  0.0000,  0.0000
    };

    float test2[INPUT_SIZE] = {
       0.0000,  0.0000,  0.0000,  0.0000,  0.0000,  0.0000,  0.0000,  0.0000,  0.0000,  0.0000,  0.5936,  0.3471,  0.3933,  0.3409,  0.7274,  0.3413,  0.2390,  0.2948,  0.7652,  0.3070,  0.0871,  0.2514,  0.5523,  0.5722,  0.4217,  0.5680,  0.0000,  0.0000,  0.0000,  0.0000,  0.0000,  0.0000,  0.0000,  0.0000,  -0.9999, -0.7687, -0.4032, -0.2229,  0.0000,  0.0000,  0.0000,  0.0000,  0.0000,  0.0000,  0.0000,  0.0000,  0.0000,  0.0000,  0.0000,  0.0000,  0.0000,  0.0000, -0.9664, -0.9973, -0.0896, -0.0401,  0.0000,  0.0000,  1.0000};

    float test3[INPUT_SIZE] = {0.0000,  0.0000,  0.0000,  0.0000,  0.0000,  0.0000,  0.0000,  0.0000,  0.0000,  0.0000,  0.3683,  0.3506,  0.5724,  0.3536,  0.2085,  0.3744,  0.6959,  0.3927,  0.0878,  0.3721,  0.7493,  0.3809,  0.4352,  0.5969,  0.5655,  0.6002,  0.0000,  0.0000,  0.0000,  0.0000,  0.0000,  0.0000,  0.0000,  0.0000,
         -0.8657, -0.9860,  0.2749, -0.1169,  0.0000,  0.0000,  0.0000,  0.0000,  0.0000,  0.0000,  0.0000,  0.0000,  0.0000,  0.0000,  0.0000,  0.0000,  0.0000,  0.0000, -0.9576, -0.9868,  0.0273,  0.0215,  0.0000,  0.0000,  1.0000
};
    run_test(test1, "Test 1");
    run_test(test2, "Test 2");
    run_test(test2, "Test 3");

    return 0;
}