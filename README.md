## Environment

Create a local `.env` file from `.env.example` and keep it out of Git.

```env
PORT=3000
CORS_ORIGIN=*
HTTP_RATE_LIMIT_LIMIT=100
SOCKET_AUTH_LIMIT=5
SOCKET_MAX_BUFFER_SIZE=8192
DB_HOST=localhost
DB_PORT=3306
DB_USER=replace_with_db_user
DB_PASSWORD=replace_with_db_password
DB_NAME=spielo
JWT_SECRET=replace_with_a_long_random_secret
```

- `PORT`: server port, defaults to `3000`
- `CORS_ORIGIN`: allowed frontend origin, defaults to `*`
- `HTTP_RATE_LIMIT_LIMIT`: maximum HTTP requests per 15 minutes, defaults to `100`
- `SOCKET_AUTH_LIMIT`: maximum Socket.IO auth attempts per 15 minutes, defaults to `5`
- `SOCKET_MAX_BUFFER_SIZE`: maximum Socket.IO message size in bytes, defaults to `8192`
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`: MySQL connection settings
- `JWT_SECRET`: signing secret for session tokens
