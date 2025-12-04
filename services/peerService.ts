import { Peer, DataConnection } from 'peerjs';
import { NetworkMessage } from '../types';

// Helper to generate a random short ID
export const generateShortId = () => {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
};

export class PeerService {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private onMessageCallback: ((msg: NetworkMessage) => void) | null = null;
  private onConnectCallback: (() => void) | null = null;

  constructor() {}

  init(id: string): Promise<string> {
    return new Promise((resolve, reject) => {
      // Clean up existing
      if (this.peer) this.peer.destroy();

      this.peer = new Peer(id, {
        debug: 1
      });

      this.peer.on('open', (id) => {
        console.log('My peer ID is: ' + id);
        resolve(id);
      });

      this.peer.on('connection', (conn) => {
        this.handleConnection(conn);
      });

      this.peer.on('error', (err) => {
        console.error('Peer error', err);
        reject(err);
      });
    });
  }

  connect(hostId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.peer) {
        reject(new Error('Peer not initialized'));
        return;
      }

      const conn = this.peer.connect(hostId);
      
      conn.on('open', () => {
        this.handleConnection(conn);
        resolve();
      });

      conn.on('error', (err) => {
        reject(err);
      });
    });
  }

  private handleConnection(conn: DataConnection) {
    this.conn = conn;
    
    if (this.onConnectCallback) {
      this.onConnectCallback();
    }

    this.conn.on('data', (data) => {
      if (this.onMessageCallback) {
        this.onMessageCallback(data as NetworkMessage);
      }
    });
    
    this.conn.on('close', () => {
      console.log("Connection closed");
      this.conn = null;
    });
  }

  send(msg: NetworkMessage) {
    if (this.conn && this.conn.open) {
      this.conn.send(msg);
    }
  }

  onMessage(cb: (msg: NetworkMessage) => void) {
    this.onMessageCallback = cb;
  }

  onConnect(cb: () => void) {
    this.onConnectCallback = cb;
  }

  destroy() {
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
  }
}

export const peerService = new PeerService();