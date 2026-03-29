import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import type { 
    RoomAction, 
    CursorEvent, 
    ClientToServerEvents, 
    ServerToClientEvents, 
    DrawStartEvent, 
    DrawUpdateEvent, 
    DrawEndEvent, 
    BrushSettings 
} from "drawers-shared";
import { customAlphabet } from "nanoid"
import cors from "cors";
import dotenv from 'dotenv';

const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const nanoid = customAlphabet(alphabet, 6);

const envFile = process.env.NODE_ENV === "production" ? ".env.production" : ".env.local";
dotenv.config({ path: envFile });

const app = express();
const httpServer = createServer(app);

app.use(cors({
    origin: process.env.FRONTEND_URL,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
}));

app.use(express.json())

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: {
        origin: process.env.FRONTEND_URL,
        credentials: true,
    },
});

interface Room {
    hostId: string;
    users: Map<string, string>; // socketId -> username
}

/**
 * Returns a random integer between min (inclusive) and max (exclusive).
 * @param min - The minimum integer (inclusive)
 * @param max - The maximum integer (exclusive)
 */
function getRandomInt(min: number, max: number): number {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min) + min);
}

const rooms = new Map<string, Room>();

io.on("connection", (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    const leaveRoom = (roomId: string, socketId: string) => {
        const room = rooms.get(roomId);
        if (!room) return;
        room.users.delete(socketId)
        if (socketId === room.hostId) {
            if (room.users.size > 0) {
                const userIndex = getRandomInt(0, room.users.size)
                const userRecord = Array.from(room.users)[userIndex]
                if (!userRecord) {
                    rooms.delete(roomId)
                    return
                }
                const hostId = userRecord[0]
                room.hostId = hostId
                io.to(roomId).emit("host_changed", hostId);
            }
            else {
                rooms.delete(roomId);
            }
        }
        io.to(roomId).emit("user_left", Array.from(room.users));
    };

    const getRoomUsers = (roomId: string) => rooms.get(roomId)?.users || {};
    const isHost = (roomId: string, socketId: string) => rooms.get(roomId)?.hostId === socketId;

    socket.on("join_room", (data: RoomAction) => {

        const socketId = socket.id
        const { roomId, username } = data

        const room: Room | undefined = rooms.get(roomId);

        if (!room) {
            socket.emit("join_error", { message: "Room not found" });
            return;
        }

        let hostUserId = room.hostId
        if (room.users.size == 0) {
            hostUserId = socketId
        }
        room.hostId = hostUserId
        room.users.set(socketId, username)

        socket.join(roomId);

        socket.emit("join_success", socketId);
        console.log(`User "${username}" has joined room "${roomId}".`);
        io.to(roomId).emit("user_joined", Array.from(room.users));
    });

    socket.on("request_canvas_snapshot", (data: { roomId: string, targetUserId: string }) => {
        const socketId = socket.id
        const { roomId } = data

        const room: Room | undefined = rooms.get(roomId);

        if (!room) {
            socket.emit("general_error", { message: "Room not found" });
            return;
        }

        let hostUserId = room.hostId

        if (socketId !== hostUserId) {
            console.log("EMIT REQUEST CANVAS");

            io.to(hostUserId).emit("request_canvas_snapshot", socketId);
        }
    })

    socket.on("canvas_snapshot", (data: any) => {
        const { targetUserId, snapshot } = data;
        io.to(targetUserId).emit("canvas_snapshot", { targetUserId, snapshot });
    });

    socket.on("draw_start", (data: DrawStartEvent) => {
        socket.to(data.roomId).emit("draw_start", data)
    })

    socket.on("draw_update", (data: DrawUpdateEvent) => {
        socket.to(data.roomId).emit("draw_update", data)
    })

    socket.on("draw_end", (data: DrawEndEvent) => {
        socket.to(data.roomId).emit("draw_end", data)
    })

    socket.on("fetch_users", (roomId: string) => {
        const room = rooms.get(roomId);

        if (!room) return;
        socket.emit("return_users", Array.from(room.users), room.hostId)
    })

    socket.on("cursor_move", (data: CursorEvent) => {
        socket.to(data.roomId).emit("cursor_move", data);
    });

    socket.on("clear_canvas", (data: RoomAction) => {
        if (!isHost(data.roomId, socket.id)) return; // only host can clear
        io.to(data.roomId).emit("clear_canvas");
    });

    socket.on("disconnecting", () => {
        const roomsJoined = Array.from(socket.rooms);
        roomsJoined.forEach((roomId) => leaveRoom(roomId, socket.id));
    });

    // new events (same pattern as canvas_snapshot)
    socket.on("request_brush_states", (data: { roomId: string; targetUserId: string }) => {
        const { roomId } = data;
        const room = rooms.get(roomId);
        if (!room) {
            socket.emit("general_error", { message: "Room not found" });
            return;
        }
        // Ask *everyone* in the room to share their brush settings
        io.to(roomId).emit("request_brush_states", data);
    });

    socket.on("brush_state", (data: { targetUserId: string; userId: string; brushSettings: BrushSettings }) => {
        io.to(data.targetUserId).emit("brush_state", data);
    });

});

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
    console.log(`Socket.io server running on port ${PORT}`);
});

const createRoom = (roomId: string) => {
    rooms.set(roomId, { hostId: "", users: new Map() });
};

// POST /rooms
app.post("/rooms", (req, res) => {
    const roomId = nanoid();
    createRoom(roomId);
    res.status(201).json({ roomId });
});

const usernameRegex = /^(?=.*[A-Za-z0-9])[A-Za-z0-9]+(?: [A-Za-z0-9]+)*$/;

function isValidUsername(username: string): boolean {
    const trimmed = username.trim();
    if (trimmed.length < 3 || trimmed.length > 24) return false;
    return usernameRegex.test(trimmed);
}

app.get("/rooms/:roomId", (req, res) => {

    const { roomId } = req.params
    const roomExists = rooms.get(roomId);

    if (!roomExists) return res.status(404).json({ error: "Room not found" });

    return res.status(200).json({ roomId })

})


// POST /rooms/:roomId/exists
app.post("/validate_username", (req, res) => {
    console.log("validate_username", req.params, "\n\n", req.body);

    const { roomId, username } = req.body

    // Room exists
    const roomExists = rooms.get(roomId);
    if (!roomExists) return res.status(404).json({ error: "Room not found" });

    // Invalid username
    const validName = isValidUsername(username)
    if (!validName) return res.status(400).json({ error: "Invalid username" });

    // Duplicate user in room
    if (Array.from(roomExists.users.values()).find((u) => u === username) !== undefined) return res.status(409).json({ error: "Duplicate username" });

    res.status(200).json({ roomId });
});