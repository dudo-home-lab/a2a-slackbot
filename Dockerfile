# Start from the official LTS Node image.
FROM node:24 AS base

WORKDIR /usr/src/app

# Copy the package files and download the dependencies.
# This is done before installing dependencies or copying code to leverage Docker cache layers.
COPY package*.json ./
COPY tsconfig.json ./

# Update npm to the latest version.
RUN npm install -g npm@latest

# Install all dependencies (including devDependencies for TypeScript)
RUN npm ci --silent

# Copy the source code from the current directory to the working directory inside the container.
COPY . .

FROM base as builder

# Build the TypeScript application
RUN npm run build

# Continue with the official LTS Node image to create a production image.
FROM node:24

WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install only production dependencies from the lock file.
RUN npm ci --silent --production

# Copy built application from builder stage
COPY --from=builder /usr/src/app/dist ./dist

EXPOSE 3000

# Define the entry point for the docker image.
# This is the command that will be run when the container starts.
ENTRYPOINT [ "npm" ]
CMD [ "run", "start" ]
