FROM node:22-bullseye

# Create app directory
WORKDIR /app

# Install app dependencies
COPY package*.json ./
RUN npm install

# Copy prisma schema and generate client
COPY prisma ./prisma/
RUN npx prisma generate

# Copy source code
COPY . .

# Hugging Face Spaces routes traffic to port 7860
EXPOSE 7860
ENV PORT=7860

# Add environment variables here or in the Hugging Face Space settings
# ENV JWT_SECRET=your_jwt_secret
# ENV DATABASE_URL=file:./dev.db
# ENV FRONTEND_URL=https://your-frontend-domain.com

# Start the application
CMD ["npm", "start"]
