#include <iostream>
#include <chrono>
#include <thread>
#include <cstring>      // for memset, strerror
#include <cerrno>       // for errno
#include <unistd.h>     // for close()
#include <arpa/inet.h>  // for inet_aton, htons
#include <sys/socket.h>
#include <netinet/in.h>

#include "rpc/client.h"

struct ai_input_t {
    float data[59];
};

int send_to_ai(ai_input_t data) {
    const char *dest_ip = "127.0.0.1";
    uint16_t dest_port = 2001;

    // 1. Create socket (IPv4, TCP)
    int sock = socket(AF_INET, SOCK_STREAM, 0);
    if (sock < 0) {
        std::cerr << "socket() error: " << strerror(errno) << "\n";
        return -1;
    }

    // 2. Prepare server address struct
    struct sockaddr_in serv_addr;
    memset(&serv_addr, 0, sizeof(serv_addr));
    serv_addr.sin_family = AF_INET;
    serv_addr.sin_port = htons(dest_port);
    if (inet_pton(AF_INET, dest_ip, &serv_addr.sin_addr) <= 0) {
        std::cerr << "inet_pton() error for " << dest_ip << "\n";
        close(sock);
        return -1;
    }

    // 3. Connect to server
    if (connect(sock, (struct sockaddr *)&serv_addr, sizeof(serv_addr)) < 0) {
        std::cerr << "connect() error: " << strerror(errno) << "\n";
        close(sock);
        return -1;
    }

    // 4. Send message
    ssize_t nsent = send(sock, &data, sizeof(data), 0);
    if (nsent < 0) {
        std::cerr << "send() error: " << strerror(errno) << "\n";
        close(sock);
        return -1;
    }

    std::cout << "Sent " << nsent << " bytes\n";

    // 5. Receive reply
    float result = -1;
    ssize_t nrecv = recv(sock, &result, sizeof(result), 0);
    if (nrecv < 0) {
        std::cerr << "recv() error: " << strerror(errno) << "\n";
        return -1;
    } else if (nrecv == 0) {
        std::cout << "Server closed connection\n";
        return -1;
    } else {
        std::cout << "Received: " << result << "\n";
        return result;
    }
}

int main() {
    rpc::client c("localhost", 3000);

    while (true) {
        auto img_qlen = c.call("img_qlen").as<int>();
        if (img_qlen != 0) {
            std::cout << "img_qlen() = " << img_qlen << std::endl;
        }
        while (img_qlen > 0) {
            auto raw_bytes = c.call("get_img_data").as<std::array<char, sizeof(ai_input_t)>>();
            ai_input_t img_data;
            for (size_t i = 0; i < sizeof(ai_input_t); i++) {
                auto* ptr = reinterpret_cast<char*>(&img_data);
                *(ptr+i) = raw_bytes[i];
            }
            auto result = send_to_ai(img_data);
            if (result == -1) {
                std::cout << "send_to_ai() error\n";
            }
            c.call("put_result", result == 1 ? true : false);
            std::cout << "img_qlen() = ";
            img_qlen = c.call("img_qlen").as<int>();
            std::cout << img_qlen << std::endl;
        }
        // std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }

    return 0;
}
