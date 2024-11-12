//
// Created by David Laeer on 2024-11-11.
//

#ifndef SERVER_H
#define SERVER_H

#include "SessionManager.h"

#include <crow/app.h>

#define WS_ENDPOINT "/ws"

class Server {
public:
    Server();
    void run(int port, size_t n_threads = std::thread::hardware_concurrency());
private:
    crow::SimpleApp app;
    SessionManager sessionManager;
};



#endif //SERVER_H
