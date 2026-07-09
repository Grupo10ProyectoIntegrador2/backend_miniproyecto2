# Backend — Salón de Estudio Colaborativo en Tiempo Real

**Mini-proyecto 2 | Proyecto Integrador I – 2026-I**  
Stack: Node.js + Express + TypeScript + Socket.IO + Firebase Admin

---

## 📋 Descripción

Backend del sistema de salones de estudio colaborativos en tiempo real. Provee:
- **API REST** para autenticación, gestión de usuarios y salas
- **WebSockets (Socket.IO)** para comunicación en tiempo real (chat, notificaciones, sincronización)
- **Signaling Server WebRTC** para videollamadas P2P
- **Firebase Admin** para validación de tokens y acceso a Firestore
- **Documentación Swagger** disponible en `/api-docs`

---

## 🚀 Inicio Rápido

### Prerrequisitos Técnicos

Antes de comenzar, asegúrate de tener instalado:

- **Node.js** (versión 18 o superior) — [Descargar aquí](https://nodejs.org/)
- **npm** o **pnpm** (se incluye con Node.js)
- **Git** para clonar el repositorio
- **Cuenta de Firebase** con un proyecto creado — [Firebase Console](https://console.firebase.google.com/)
- **Service Account de Firebase** descargado (archivo JSON)

### Instalación Local

```bash
# 1. Clonar el repositorio
git clone https://github.com/Grupo10ProyectoIntegrador2/backend_miniproyecto2.git
cd backend_miniproyecto2

# 2. Instalar dependencias
npm install
# o si usas pnpm:
pnpm install

# 3. Configurar variables de entorno (ver sección siguiente)
cp .env.example .env
# Edita el archivo .env con tus credenciales reales

# 4. Configurar Firebase Admin SDK (ver sección Firebase)
# Coloca el archivo firebase-adminsdk.json en la raíz del proyecto

# 5. Iniciar el servidor en modo desarrollo
npm run dev

# El servidor estará disponible en:
# → http://localhost:3000
# → Documentación Swagger: http://localhost:3000/api-docs
```

---

## ⚙️ Configuración de Variables de Entorno

Crea un archivo `.env` en la raíz del proyecto basándote en `.env.example`:

### Variables Requeridas

#### `PORT`
**Descripción**: Puerto en el que se ejecutará el servidor Express.  
**Valor por defecto**: `3000`  
**Ejemplo**: `PORT=3000`

#### `ALLOWED_ORIGINS`
**Descripción**: Orígenes permitidos para peticiones CORS. Separa múltiples orígenes con comas.  
**Desarrollo local**: `http://localhost:5173` (puerto por defecto de Vite)  
**Producción**: URL de tu frontend desplegado en Vercel  
**Ejemplo**: `ALLOWED_ORIGINS=http://localhost:5173,https://tu-app.vercel.app`

#### `FIREBASE_PROJECT_ID`
**Descripción**: ID del proyecto de Firebase. Lo encuentras en Firebase Console → Configuración del proyecto.  
**Ejemplo**: `FIREBASE_PROJECT_ID=salon-estudio-abc123`

#### Variables Opcionales para Producción

Estas variables **solo son necesarias en producción** (Render, Railway, etc.) si no usas el archivo `firebase-adminsdk.json`:

#### `FIREBASE_CLIENT_EMAIL`
**Descripción**: Email del service account de Firebase. Se encuentra en el archivo `firebase-adminsdk.json` que descargaste.  
**Ejemplo**: `FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xyz@tu-proyecto.iam.gserviceaccount.com`

#### `FIREBASE_PRIVATE_KEY`
**Descripción**: Private key del service account. Se encuentra en el archivo `firebase-adminsdk.json`.  
**⚠️ IMPORTANTE**: En producción, debes copiar el valor completo (incluyendo `-----BEGIN PRIVATE KEY-----` y `-----END PRIVATE KEY-----`) y reemplazar los saltos de línea literales con `\n`.  
**Ejemplo**: `FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQ...resto de la key...\n-----END PRIVATE KEY-----\n"`

---

## 🔥 Configuración de Firebase

### 1. Crear Proyecto en Firebase

1. Ve a [Firebase Console](https://console.firebase.google.com/)
2. Crea un nuevo proyecto o selecciona uno existente
3. Activa **Firestore Database** (modo producción o pruebas)
4. Configura las **reglas de seguridad de Firestore** (ver sección Hardening)

### 2. Obtener Service Account (Desarrollo Local)

1. En Firebase Console → **Configuración del proyecto** → **Cuentas de servicio**
2. Click en **Generar nueva clave privada**
3. Descarga el archivo JSON
4. **Renombra el archivo** a `firebase-adminsdk.json`
5. **Coloca el archivo en la raíz** del proyecto backend
6. **⚠️ NUNCA subas este archivo a Git** (ya está en `.gitignore`)

### 3. Configurar para Producción

Para desplegar en Render, Railway o similar:

1. **NO subas** `firebase-adminsdk.json` al repositorio
2. En el panel de tu servicio de hosting, configura las variables de entorno:
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_CLIENT_EMAIL`
   - `FIREBASE_PRIVATE_KEY` (copia todo el contenido, reemplazando saltos de línea con `\n`)

El código en `src/config/firebase.ts` detectará automáticamente si usar el archivo JSON (local) o las variables de entorno (producción).

---

## 🔌 Conectar con el Frontend

El frontend debe configurar estas variables en su `.env`:

```env
VITE_API_BASE_URL=http://localhost:3000
```

En producción (Vercel):

```env
VITE_API_BASE_URL=https://tu-backend.onrender.com
```

### Flujo de Comunicación

1. **Autenticación**: El frontend envía el token de Firebase Auth en el header `Authorization: Bearer <token>`
2. **Validación**: El backend valida el token usando Firebase Admin SDK
3. **WebSockets**: Una vez autenticado, el cliente se conecta a Socket.IO con el mismo token
4. **Eventos en Tiempo Real**: Chat, notificaciones, sincronización de estado de sala, señalización WebRTC

---

## 🌐 WebSockets y Señalización WebRTC

El servidor Socket.IO actúa como **Signaling Server** para videollamadas P2P usando WebRTC. No procesa ni retransmite audio/video, solo facilita el intercambio de información para que los navegadores se conecten directamente.

### Eventos de Señalización (Signaling) WebRTC

#### `offer`
- **Emisor**: Cliente que inicia la conexión
- **Payload**: `{ targetSocketId: string, offer: RTCSessionDescriptionInit }`
- **Descripción**: Un peer envía una oferta SDP para conectarse con otro peer
- **Respuesta del servidor**: Reenvía la oferta al socket destino

#### `answer`
- **Emisor**: Cliente que responde a la oferta
- **Payload**: `{ targetSocketId: string, answer: RTCSessionDescriptionInit }`
- **Descripción**: El peer receptor envía su respuesta SDP
- **Respuesta del servidor**: Reenvía la respuesta al socket emisor original

#### `ice-candidate`
- **Emisor**: Ambos peers durante la negociación
- **Payload**: `{ targetSocketId: string, candidate: RTCIceCandidateInit }`
- **Descripción**: Intercambio de candidatos ICE para descubrir rutas de red
- **Respuesta del servidor**: Reenvía el candidato al socket destino

### Control de Estados AV y Compartir Pantalla

#### `toggle-av`
- **Payload**: `{ audio: boolean, video: boolean }`
- **Descripción**: Un usuario cambia el estado de su micrófono/cámara
- **Respuesta del servidor**: Actualiza el estado en memoria y emite `av-state-changed` a todos en la sala

#### `toggle-screen-share`
- **Payload**: `{ isSharing: boolean }`
- **Descripción**: Un usuario inicia/detiene compartir pantalla
- **Respuesta del servidor**: Actualiza el estado y emite `screen-share-changed` a todos

#### `video-call-status`
- **Emisor**: Servidor al unirse a una sala con videollamada activa
- **Payload**: Estado completo de la videollamada (participantes, estados AV, quién comparte pantalla)
- **Descripción**: Sincroniza el estado de UI para usuarios que se unen tarde

---

## 📜 Scripts Disponibles

```bash
# Desarrollo (recarga automática con tsx watch)
npm run dev

# Compilar TypeScript a JavaScript
npm run build

# Ejecutar en producción (requiere npm run build primero)
npm run start

# Compilar en modo watch (desarrollo alternativo)
npm run watch
```

---

## 🚢 Despliegue en Producción

### Opción Recomendada: Render

1. **Crear cuenta en [Render](https://render.com/)**
2. **Conectar repositorio de GitHub**
3. **Crear nuevo Web Service**
4. **Configurar**:
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm run start`
   - **Environment**: Node
5. **Agregar variables de entorno**:
   ```
   PORT=3000
   ALLOWED_ORIGINS=https://tu-frontend.vercel.app
   FIREBASE_PROJECT_ID=tu-proyecto-id
   FIREBASE_CLIENT_EMAIL=tu-service-account@...
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
   ```
6. **Desplegar**: Render desplegará automáticamente en cada push a la rama main

### Alternativas

- **Railway**: Similar a Render, soporta despliegue automático
- **Heroku**: Requiere Procfile (obsoleto para proyectos nuevos)
- **AWS EC2/DigitalOcean**: Requiere configuración manual de servidor

---

## 🔒 Hardening y Buenas Prácticas de Seguridad

### 1. Manejo Seguro de Credenciales

#### ✅ HACER
- **Usar variables de entorno** para todas las credenciales (`.env`)
- **Nunca subir** `.env` ni `firebase-adminsdk.json` a Git
- **Rotar credenciales** si se exponen accidentalmente
- **Usar secretos del servicio de hosting** (Render, Vercel) para producción
- **Limitar permisos** del service account de Firebase al mínimo necesario

#### ❌ NUNCA HACER
- Hardcodear API keys, tokens o contraseñas en el código
- Subir archivos `.env` o `firebase-adminsdk.json` al repositorio
- Compartir credenciales por Slack, correo o chat sin encriptar
- Usar las mismas credenciales en desarrollo y producción

### 2. Configuración de CORS

El servidor tiene CORS configurado dinámicamente:

```typescript
// src/main.ts
const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : '*';

app.use(cors({ origin: allowedOrigins }));
```

**En producción**, asegúrate de:
- Configurar `ALLOWED_ORIGINS` solo con dominios confiables
- **Nunca usar** `*` (todos los orígenes) en producción
- Incluir `https://` en las URLs, no `http://`

### 3. Validación de Tokens JWT

Todas las rutas protegidas usan el middleware `verifyToken`:

```typescript
// src/middlewares/auth.middleware.ts
export const verifyToken = async (req: Request, res: Response, next: NextFunction)
```

**Verifica**:
- Token presente en header `Authorization: Bearer <token>`
- Token válido usando Firebase Admin SDK
- UID del usuario extraído y disponible en `req.uid`

**Nunca omitas** este middleware en rutas sensibles.

### 4. Reglas de Seguridad de Firestore

Configura reglas estrictas en Firebase Console:

```javascript
// Ejemplo de reglas recomendadas
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Permitir lectura/escritura solo a usuarios autenticados
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    match /rooms/{roomId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow update, delete: if request.auth != null && 
        (resource.data.host == request.auth.uid || 
         request.auth.uid in resource.data.participants);
    }
    
    match /messages/{messageId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
    }
  }
}
```

### 5. Variables de Entorno en Producción

En Render/Railway:
1. Ve a **Environment** o **Variables**
2. Agrega cada variable manualmente (no uses archivo `.env`)
3. **Marca como secretas** las credenciales sensibles (private keys, tokens)
4. Reinicia el servicio después de cambiar variables

### 6. Rate Limiting (Recomendado para Producción)

Para evitar abuso, considera instalar `express-rate-limit`:

```bash
npm install express-rate-limit
```

```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // máximo 100 peticiones por ventana
});

app.use('/auth', limiter);
```

### 7. HTTPS en Producción

- Render y Vercel proveen HTTPS automáticamente
- **Nunca** uses `http://` para URLs de producción
- Fuerza HTTPS en el frontend: configura `VITE_API_BASE_URL=https://...`

### 8. Logging y Monitoreo

- **No loguear** tokens, contraseñas ni datos sensibles
- Usar niveles de log apropiados (error, warn, info, debug)
- Considerar servicios como **Sentry** o **LogRocket** para monitoreo

---

## ❌ Errores Comunes y Soluciones

### Error: "FIREBASE_PROJECT_ID no está definido"

**Causa**: No configuraste el archivo `.env` correctamente.

**Solución**:
1. Verifica que existe el archivo `.env` en la raíz del proyecto
2. Abre `.env` y asegúrate de que `FIREBASE_PROJECT_ID` esté definido
3. Reinicia el servidor con `npm run dev`

### Error: "Firebase credentials no están definidas"

**Causa**: No se encuentra el archivo `firebase-adminsdk.json` ni las variables de entorno.

**Solución**:
- **Desarrollo local**: Descarga `firebase-adminsdk.json` y colócalo en la raíz del proyecto
- **Producción**: Configura `FIREBASE_CLIENT_EMAIL` y `FIREBASE_PRIVATE_KEY` en las variables de entorno

### Error: CORS bloqueando peticiones desde el frontend

**Causa**: El frontend no está en la lista de `ALLOWED_ORIGINS`.

**Solución**:
1. Abre el archivo `.env`
2. Actualiza `ALLOWED_ORIGINS` para incluir la URL del frontend:
   ```env
   ALLOWED_ORIGINS=http://localhost:5173,https://tu-frontend.vercel.app
   ```
3. Reinicia el servidor

### Error: "Cannot find module './config/firebase'"

**Causa**: No compilaste el código TypeScript o hay errores de compilación.

**Solución**:
```bash
# Verifica errores de TypeScript
npm run build

# Si todo está bien, ejecuta:
npm run dev
```

### Error: WebSockets no se conectan

**Causa**: Probablemente el frontend está intentando conectarse a una URL incorrecta o el puerto está bloqueado.

**Solución**:
1. Verifica que el backend esté corriendo en `http://localhost:3000`
2. En el frontend, verifica que `VITE_API_BASE_URL=http://localhost:3000`
3. Abre la consola del navegador y busca errores de Socket.IO
4. Verifica que no haya firewall bloqueando el puerto 3000

### Error: "Port 3000 is already in use"

**Causa**: Otro proceso está usando el puerto 3000.

**Solución**:
```bash
# Opción 1: Cambiar puerto en .env
PORT=3001

# Opción 2: Encontrar y matar el proceso (macOS/Linux)
lsof -ti:3000 | xargs kill -9

# Opción 3: En Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

### Error: "Module not found" después de instalar dependencias

**Causa**: Caché de Node.js corrupto o instalación incompleta.

**Solución**:
```bash
# Limpiar caché y reinstalar
rm -rf node_modules package-lock.json
npm install
```

---

## 📚 Recursos Adicionales

- **Documentación Swagger**: Una vez el servidor esté corriendo, visita `http://localhost:3000/api-docs`
- **Firebase Admin SDK**: [Documentación oficial](https://firebase.google.com/docs/admin/setup)
- **Socket.IO**: [Guía de inicio](https://socket.io/docs/v4/)
- **WebRTC**: [MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)
- **Express.js**: [Documentación oficial](https://expressjs.com/)

---

## 📞 Soporte

Si encuentras problemas no cubiertos en esta documentación:

1. Revisa los logs del servidor en la terminal
2. Verifica la consola del navegador (para errores de CORS o WebSockets)
3. Consulta la documentación oficial de Firebase y Socket.IO
4. Revisa el código en `src/config/socket.ts` para entender el flujo de eventos

---

## 📄 Licencia

ISC
