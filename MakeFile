.PHONY: help install dev build start clean test lint format

help:
	@echo "Available commands:"
	@echo "  make install   - Install dependencies"
	@echo "  make dev       - Start development server"
	@echo "  make build     - Build for production"
	@echo "  make start     - Start production server"
	@echo "  make clean     - Clean build files"
	@echo "  make test      - Run tests"
	@echo "  make lint      - Run linter"
	@echo "  make format    - Format code"

install:
	pnpm install

dev:
	pnpm dev

build:
	pnpm build

start:
	pnpm start

clean:
	pnpm clean

test:
	pnpm test

lint:
	pnpm lint

format:
	pnpm format