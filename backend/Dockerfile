FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci --only=production

# Generate Prisma client
RUN npx prisma generate

# Copy source
COPY src ./src/

EXPOSE 3001

# Run migrations then start
CMD ["sh", "-c", "npx prisma migrate deploy && node src/app.js"]
