import { useEffect } from 'react';
import './style.css';

export interface MessageProps {
    id: string;
    type: 'success' | 'error' | 'warning' | 'info';
    content: string;
    duration?: number;
    onClose: (id: string) => void;
}

const Message: React.FC<MessageProps> = ({
    id,
    type,
    content,
    duration = 3000,
    onClose,
}) => {
    useEffect(() => {
        const timer = setTimeout(() => {
            onClose(id);
        }, duration);

        return () => clearTimeout(timer);
    }, [id, duration, onClose]);

    return (
        <div className={`message message-${type}`}>
            <span className="message-icon" />
            <span className="message-content">{content}</span>
        </div>
    );
};

export default Message;
