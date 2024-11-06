# Use the latest Node.js image
FROM node:latest

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy credentials.json to the working directory
COPY credentials.json /usr/src/app/credentials.json

# Copy the rest of the application code
COPY . .

# Build the application (if using TypeScript)
RUN npm run build

# Expose the port the app runs on
EXPOSE 3000

# Command to run the application
CMD ["npm", "run", "start:prod"]
