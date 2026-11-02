async function sendMessage(userMessage) {
    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messages: [
                    { role: 'user', content: userMessage }
                ]
            })
        });

        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }

        const data = await response.json();
        const botReply = data.choices[0].message.content;
        return botReply;

    } catch (error) {
        console.error('Fetch error:', error);
        throw error;
    }
}