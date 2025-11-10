import amqp from 'amqplib';

export let wssInstance = null;
let broadcastChannel = null;

const RABBITMQ_URL = process.env.RABBIT_MQ_URL || 'amqp://localhost';
const BROADCAST_EXCHANGE = 'websocket_broadcast';

export function setWss(wss) {
  wssInstance = wss;
}

export async function initBroadcastListener() {
  try {
    const connection = await amqp.connect(RABBITMQ_URL);
    const channel = await connection.createChannel();
    
    await channel.assertExchange(BROADCAST_EXCHANGE, 'fanout', { durable: false });
    const q = await channel.assertQueue('', { exclusive: true });
    
    await channel.bindQueue(q.queue, BROADCAST_EXCHANGE, '');
    
    console.log('Broadcast listener ready');
    
    channel.consume(q.queue, (msg) => {
      if (msg && wssInstance) {
        const data = msg.content.toString();
        wssInstance.clients.forEach((client) => {
          if (client.readyState === 1) {
            client.send(data);
          }
        });
      }
    }, { noAck: true });
    
  } catch (error) {
    console.error('Failed to init broadcast listener:', error);
  }
}

export async function broadcast(data) {
  try {
    if (!broadcastChannel) {
      const connection = await amqp.connect(RABBITMQ_URL);
      broadcastChannel = await connection.createChannel();
      await broadcastChannel.assertExchange(BROADCAST_EXCHANGE, 'fanout', { durable: false });
    }
    
    const message = typeof data === 'string' ? data : JSON.stringify(data);
    broadcastChannel.publish(BROADCAST_EXCHANGE, '', Buffer.from(message));
    
  } catch (error) {
    console.error('Broadcast error:', error);
  }
}