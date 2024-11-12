//
// Created by David Laeer on 2024-11-11.
//

#include "Server.h"

#include <nlohmann/json.hpp>

using namespace std;
using namespace nlohmann;

Server::Server() {
    CROW_WEBSOCKET_ROUTE(app, WS_ENDPOINT)
    .onopen([this](crow::websocket::connection& conn) {})
    .onmessage([this](crow::websocket::connection& conn, const string& message, bool is_binary) {
        json temp_data, response;
        try {
            temp_data = json::parse(message);
        } catch (json::parse_error& e) {
            response["response"] = "bad_message";
            response["reason"] = e.what();;
            conn.send_text(response.dump());
            CROW_LOG_INFO << "Received bad json: " << message << "Causing exception " << e.what();
            return;
        }

        const json& data = temp_data;

        constexpr static auto ALLOWED_TYPES = {
        "create",
        "join",
        "leave",
        "message"
        };

        if (not data.contains("type")) {
            response["response"] = "bad_message";
            response["reason"] = "missing key 'type'";
            conn.send_text(response.dump());
            CROW_LOG_INFO << "Received bad json, replying: " << response.dump();
            return;
        }

        if (ranges::none_of(ALLOWED_TYPES, [&data](const auto type) {
            return data.at("type") == type;
        })) {
            response["response"] = "bad_message";
            response["reason"] = string("unknown key ") + data["type"].get<string>();
            conn.send_text(response.dump());
            CROW_LOG_INFO << "Received bad json, replying: " << response.dump();
            return;
        }


        if (data.at("type") == "create") {
            const string newId = sessionManager.createNewSession(&conn);
            response["response"] = "success";
            response["id"] = newId;
            CROW_LOG_INFO << "Created session: " << newId;
            conn.send_text(response.dump());
            return;
        }


        if (data.at("type") == "join") {
            if (not data.contains("id")) {
                response["response"] = "bad_request";
                response["reason"] = "missing key 'id'";
                conn.send_text(response.dump());
                CROW_LOG_INFO << "Received bad json, replying: " << response.dump();
                return;
            }

            const string id = data.at("id");

            switch(sessionManager.addUserToSession(&conn, id)) {
                case SessionManager::ret::SESSION_NOT_FOUND:
                    response["response"] = "bad_request";
                    response["reason"] = "session not found";
                    break;
                case SessionManager::ret::SESSION_USER_EXISTS:
                    response["response"] = "error";
                    response["reason"] = "user already in session";
                    break;
                case SessionManager::ret::OK:
                    response["response"] = "success";
                    response["id"] = id;
                    break;
                default:
                    response["response"] = "bad_request";
                    response["reason"] = "server error";
                    break;
            }
            CROW_LOG_INFO << "Received join request, replying " << response.dump();
            conn.send_text(response.dump());
            return;
        }

        if (data.at("type") == "leave") {
            //handle leave
            return;
        }

        if (data.at("type") == "message") {
            constexpr array REQUIRED_KEYS{"id", "payload"};

            for (const auto key : REQUIRED_KEYS) {
                if (not data.contains(key)) {
                    response["response"] = "bad_request";
                    response["reason"] = format("missing key '{}'", key);
                    conn.send_text(response.dump());
                    CROW_LOG_INFO << "Received bad json, replying: " << response.dump();
                    return;
                }
            }

            const string id = data["id"];
            SessionManager::Session *session = sessionManager.getSessionById(id);
            if (not session) {
                response["response"] = "bad_request";
                response["reason"] = "session not found";
                conn.send_text(response.dump());
                return;
            }
            if (not session->containsUser(&conn)) {
                response["response"] = "bad_request";
                    response["reason"] = format("user not in session {}", id);
                    conn.send_text(response.dump());
                    return;
            }
            session->sendToPeers(&conn, data["payload"]);
            response["response"] = "success";
            response["status"] = "sent";
            CROW_LOG_INFO << "Successfully relayed message " << data["payload"];
            conn.send_text(response.dump());
            return;
        }

    })
    .onclose([this](crow::websocket::connection& conn, const string& reason) {
        sessionManager.removeUserFromAny(&conn);
    });
}

void Server::run(const int port, const size_t n_threads) {
    app.concurrency(n_threads == 0 ? std::thread::hardware_concurrency() : n_threads).port(port).loglevel(crow::LogLevel::INFO).run();
}
