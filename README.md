WebSocket backend server for the [Drawers](https://github.com/mrazbeno/drawers-frontend) app.

**Not actively developed.**

# Content summary
A small JavaScript Express server, responsible for managing member hubs/rooms and routing WebSocket messages between clients of the collaborative drawing app called Drawers. 

# Features

### Member rooms
Users are grouped into virtual sets called rooms. A small ID identifies a room, and joining is possible via sharing it. Inside a room, messages are generally broadcasted. 
### Member roles
Every room has an admin/owner, initially the creator, who can perform authoritative tasks and special canvas actions, such as clearing it. A room always has an owner; the role gets inherited.
### Realtime syncing
The state of the canvas and the room are always synchronized, in realtime, in a streaming manner via WebSockets.
### Late join handling
A snapshot of the current state of the canvas is served to members who joined after some work has been done. 

# Future improvements
  -  Code separation
  -  Stricter message sender validation
  -  More descriptive event names
