This repository contains the backend server for the Drawers app.

Related repositories:
  -  **[drawers-frontend](https://github.com/mrazbeno/drawers-frontend)**
  -  [drawers-shared](https://github.com/mrazbeno/drawers-shared)

# Drawers Backend
A small Express and Socket.IO server responsible for managing rooms and routing real-time messages between clients in the Drawers collaborative drawing app.

# Features

### Room management
Users are grouped into rooms identified by a short shareable ID. Most events are broadcast within the active room. 
### Host role
Each room has a host, initially the creator, who can perform authoritative canvas actions such as clearing the canvas. If the host leaves, host ownership is reassigned.
### Real-time synchronization
Canvas and room state are synchronized between connected clients in real time via WebSockets.
### Late join handling
Users who join an already active room can receive a snapshot of the current canvas state.

# Future improvements
  -  Code separation
  -  Stricter validation of event senders
  -  More descriptive event names
