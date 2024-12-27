FROM node:18-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies without running scripts
RUN npm install --production --no-scripts

# Copy app source
COPY . .

# Expose port
EXPOSE 3000

# Start the app
CMD ["npm", "start"] 