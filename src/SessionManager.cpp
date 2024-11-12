//
// Created by David Laeer on 2024-11-11.
//

#include "SessionManager.h"

using namespace std;

bool SessionManager::hasSession(const std::string &id) const {
    return sessions.contains(id);
}

std::string SessionManager::createNewSession(crow::websocket::connection *newMember) {
    string session;

    do {
        session = generateRandomSessionName();
    }
    while (sessions.contains(session));
    sessions.insert({session, {}});
    sessions[session].addUser(newMember);
    return session;
}

SessionManager::Session *SessionManager::getSessionById(const std::string &id) {
    if (sessions.contains(id)) {
        return &sessions.at(id);
    }
    return nullptr;
}


SessionManager::ret SessionManager::addUserToSession(crow::websocket::connection *newMember,
                                                     const std::string &sessionID) {
    if (not sessions.contains(sessionID)) {
        return ret::SESSION_NOT_FOUND;
    }

    if (not sessions.at(sessionID).addUser(newMember)) {
        return ret::SESSION_USER_EXISTS;
    }

    return ret::OK;
}

SessionManager::ret SessionManager::removeUserFromAny(crow::websocket::connection *userToRemove) {
    if (not userToRemove) {
        return ret::NULL_CONN_PTR;
    }

    for (auto& [id, s] : sessions) {
        if (s.removeUser(userToRemove) == ret::OK) {

            if (s.empty()) { //purge empty sessions
                sessions.erase(id);
            }

            return ret::OK;
        }
    }
    return ret::USER_NOT_FOUND;
}

string SessionManager::generateRandomSessionName() {
    static mt19937_64 rng(random_device{}());
    static constexpr char chars[]{"0123456789abcdefghijklmnopqrstuvwxyz"};

    string res;
    res.reserve(6);

    uniform_int_distribution<> dist(0, sizeof(chars) - 1);

    for (int i = 0; i < 6; i++) {
        res.push_back(chars[dist(rng)]);
    }

    return res;
}
