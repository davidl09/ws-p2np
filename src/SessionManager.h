//
// Created by David Laeer on 2024-11-11.
//

#ifndef SESSIONMANAGER_H
#define SESSIONMANAGER_H

#include <crow/websocket.h>
#include <vector>

class SessionManager {
public:

    enum class ret {
        OK,
        USER_NOT_FOUND,
        SESSION_NOT_FOUND,
        SESSION_USER_EXISTS,
        NULL_CONN_PTR,
    };

    struct Session {
        void sendToPeers(crow::websocket::connection* conn, const std::string& msg) const {
            for (const auto c : members) {
                if (c != conn) {
                    c->send_text(msg);
                }
            }
        }

        ret removeUser(const crow::websocket::connection *conn) {
            for (auto iter = members.begin(); iter != members.end(); ++iter) {
                if (*iter == conn) {
                    members.erase(iter);
                    return ret::OK;
                }
            }
            return ret::USER_NOT_FOUND;
        }

        bool containsUser(const crow::websocket::connection *conn) {
            return std::ranges::find(members, conn) != members.end();
        }

        bool addUser(crow::websocket::connection *conn) {
            if (containsUser(conn)) {
                return false;
            }
            members.push_back(conn);
            return true;
        }

        [[nodiscard]] size_t userCount() const {
            return members.size();
        }

        [[nodiscard]] bool empty() const {
            return members.empty();
        }

    private:
        std::vector<crow::websocket::connection *> members;
    };

    SessionManager() = default;
    ~SessionManager() = default;

    [[nodiscard]] bool hasSession(const std::string& id) const;
    std::string createNewSession(crow::websocket::connection *newMember);
    Session *getSessionById(const std::string &id);
    ret addUserToSession(crow::websocket::connection *newMember, const std::string &sessionID);
    ret removeUserFromAny(crow::websocket::connection *userToRemove);

private:
    std::unordered_map<std::string, Session> sessions;

    static std::string generateRandomSessionName();
};



#endif //SESSIONMANAGER_H
