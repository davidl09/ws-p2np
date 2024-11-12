add_executable(p2np
        main.cpp
        SessionManager.cpp
        Server.cpp
)

target_link_libraries(
        p2np PUBLIC
        Crow::Crow
)