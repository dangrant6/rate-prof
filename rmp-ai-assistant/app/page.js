// app/page.js
"use client";
import React, { useState, useRef, useEffect } from 'react';
import { Send, Moon, Sun } from 'lucide-react';

const RateMyProfessorAssistant = () => {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "Welcome to the Rate My Professor AI Assistant! How can I help you today?" }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [darkMode, setDarkMode] = useState(true);  // Default to dark mode
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages]);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const sendMessage = async () => {
    if (!input.trim()) return;

    setMessages(prev => [...prev, { role: 'user', content: input }]);
    setInput('');
    setIsTyping(true);
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([...messages, { role: 'user', content: input }]),
      });

      if (!response.ok) throw new Error('Failed to fetch response');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let partialResponse = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        partialResponse += chunk;

        setMessages(prev => {
          const newMessages = [...prev];
          if (newMessages[newMessages.length - 1].role === 'assistant') {
            newMessages[newMessages.length - 1].content += chunk;
          } else {
            newMessages.push({ role: 'assistant', content: partialResponse });
          }
          return newMessages;
        });
      }
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => [...prev, { role: 'assistant', content: "I'm sorry, I encountered an error. Please try again." }]);
    } finally {
      setIsTyping(false);
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([{ role: 'assistant', content: "Chat cleared. How else can I assist you?" }]);
  };

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-gray-900 text-black dark:text-white transition-colors duration-200">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
        <div className="flex items-center">
          <div className="bg-black dark:bg-white text-white dark:text-black rounded p-1 mr-2">
            <span className="font-bold text-sm">UI</span>
          </div>
          <h1 className="text-2xl font-bold">Rate My Professor Assistant</h1>
        </div>
        <div className="flex items-center">
          <button 
            onClick={clearChat}
            className="mr-2 p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Clear Chat
          </button>
          <button 
            onClick={() => setDarkMode(!darkMode)} 
            className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-grow overflow-auto p-4">
        {messages.map((message, index) => (
          <div key={index} className="mb-4">
            <div className="font-semibold">{message.role === 'user' ? 'You' : 'Assistant'}:</div>
            <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg">{message.content}</div>
          </div>
        ))}
        {isTyping && (
          <div className="mb-4">
            <div className="font-semibold">Assistant:</div>
            <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg">Typing...</div>
          </div>
        )}
        {isLoading && <div className="text-center">Loading...</div>}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about a professor or class..."
            className="flex-grow p-2 border border-gray-300 dark:border-gray-600 rounded-l-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-black dark:text-white"
            onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
          />
          <button 
            onClick={sendMessage} 
            className="p-2 bg-gray-200 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-r-md hover:bg-gray-300 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <Send size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default RateMyProfessorAssistant;