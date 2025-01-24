import { createRoot } from 'react-dom/client';
import React from 'react';
import { MessageContainer } from '../components/Message/MessageContainer';

interface MessageOptions {
    type: 'success' | 'error' | 'warning' | 'info';
    content: string;
    duration?: number;
}

class MessageService {
    private container: HTMLDivElement | null = null;
    private root: ReturnType<typeof createRoot> | null = null;
    private messages: Array<{
        id: string;
        type: MessageOptions['type'];
        content: string;
        duration?: number;
    }> = [];

    constructor() {
        this.createContainer();
    }

    private createContainer() {
        const container = document.createElement('div');
        container.className = 'message-container';
        document.body.appendChild(container);
        this.container = container;
        this.root = createRoot(container);
    }

    show(options: MessageOptions) {
        const id = Date.now().toString();
        this.messages.push({
            id,
            ...options,
        });
        this.render();
    }

    remove(id: string) {
        this.messages = this.messages.filter(msg => msg.id !== id);
        this.render();
    }

    private render() {
        if (!this.root) return;

        this.root.render(
            React.createElement(MessageContainer, {
                messages: this.messages,
                onClose: this.remove.bind(this)
            })
        );
    }
}

export const messageService = new MessageService();
