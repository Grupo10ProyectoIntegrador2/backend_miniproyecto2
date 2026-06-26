# Backend - Miniproyecto 2

Este es el backend del Miniproyecto 2. Provee la API REST y el sistema de mensajería en tiempo real mediante WebSockets (`Socket.IO`), con un enfoque específico en la coordinación de videollamadas y el intercambio de señales (Signaling) para conexiones P2P mediante WebRTC.

## WebSockets y Lógica P2P (Signaling WebRTC)

Para el funcionamiento de las videollamadas, el backend actúa como un **servidor de señalización (Signaling Server)**. No procesa ni retransmite el audio o el video directamente (lo que lo haría muy pesado), sino que facilita el intercambio de la información de conexión inicial para que los clientes del navegador puedan conectarse directamente de forma **P2P (Peer-to-Peer)** a través de WebRTC.

### Eventos de Señalización (Signaling) WebRTC
Para establecer la conexión P2P, los clientes (peers) intercambian descripciones de sesión y candidatos de red. Los eventos principales son:

- **`offer`**: Un cliente emite una oferta (`RTCSessionDescription` tipo `offer`) para conectarse con otro cliente en la sala (`targetSocketId`). El backend intercepta esto y lo reenvía de forma dirigida a ese socket destinatario.
- **`answer`**: El cliente receptor de la oferta responde emitiendo un evento `answer` con su respectiva respuesta (`RTCSessionDescription` tipo `answer`). Al igual que con la oferta, el backend lo encamina hacia el socket emisor de la oferta.
- **`ice-candidate`**: WebRTC requiere que los pares descubran cómo conectarse a través de la red local o pública, para esto se usan servidores STUN/TURN y se generan ICE Candidates. Cuando un peer obtiene un candidato, emite el evento `ice-candidate`, y el backend lo reenvía al destinatario (`targetSocketId`). Con estos candidatos recibidos, los pares completan la conexión directa de los medios.

### Control de Estados AV y Compartir Pantalla
Para sincronizar y gestionar la vista de UI (quién está muteado, sin cámara o presentando), el servidor sí guarda un estado y realiza un re-envío masivo a la sala (*broadcast*):

- **`toggle-av`**: Un usuario emite este evento indicando si su audio y video están muteados. El backend actualiza la memoria (en `VideoCallEntry`) y propaga el estado a todos en la sala con el evento `av-state-changed`.
- **`toggle-screen-share`**: Similar al de AV, se usa para notificar cuando alguien está compartiendo la pantalla (US-14). Se retransmite como `screen-share-changed`.

Además, debido a que el servidor actualiza la variable `activeVideoCalls` en memoria, cualquier usuario que entre de forma tardía a la sala o la videollamada recibirá en su evento de inicialización (`video-call-status`) los campos actualizados (`states`) reflejando qué usuarios ya tienen el micrófono apagado o si están compartiendo pantalla, logrando así la consistencia en la Interfaz de Usuario exigida.
