import React from 'react';
import Message from './index';

interface MessageContainerProps {
    messages: Array<{
        id: string;
        type: 'success' | 'error' | 'warning' | 'info';
        content: string;
        duration?: number;
    }>;
    onClose: (id: string) => void;
}

export const MessageContainer: React.FC<MessageContainerProps> = ({ messages, onClose }) => {
    return (
        <>
            {messages.map(msg => (
                <Message
                    key={msg.id}
                    id={msg.id}
                    type={msg.type}
                    content={msg.content}
                    duration={msg.duration}
                    onClose={onClose}
                />
            ))}
        </>
    );
};
