## Environment

Create a local `.env` file from `.env.example` and keep it out of Git.

```env
PORT=3000
CORS_ORIGIN=*
HTTP_RATE_LIMIT_LIMIT=100
SOCKET_AUTH_LIMIT=15
SOCKET_MAX_BUFFER_SIZE=8192
```

- `PORT`: server port, defaults to `3000`
- `CORS_ORIGIN`: allowed frontend origin, defaults to `*`
- `HTTP_RATE_LIMIT_LIMIT`: maximum HTTP requests per 15 minutes, defaults to `100`
- `SOCKET_AUTH_LIMIT`: maximum Socket.IO auth attempts per 15 minutes, defaults to `15`
- `SOCKET_MAX_BUFFER_SIZE`: maximum Socket.IO message size in bytes, defaults to `8192`
