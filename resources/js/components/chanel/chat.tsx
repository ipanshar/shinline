import React, { Component } from 'react';
import echo from '@/lib/echo';

interface MessageSentEvent {
  message: string;
}

interface ChatState {
  messages: string[];
}

class Chat extends Component<{}, ChatState> {
  private channel: any;
  private selectedVoice: SpeechSynthesisVoice | null = null; 

  constructor(props: {}) {
    super(props);
    this.state = {
      messages: [],
    };
  }

  componentDidMount() {
    this.channel = echo.channel('chat');

    this.channel.listen('.MessageSent', (e: MessageSentEvent) => {
      this.setState(prevState => ({
        messages: [e.message, ...prevState.messages], 
      }));
      this.playNotificationSound();
      
    });

    this.initVoices(); 
  }

  componentWillUnmount() {
    if (this.channel) {
      this.channel.stopListening('.MessageSent');
      echo.leave('chat');
    }
  }

  initVoices = () => {
    if ('speechSynthesis' in window) {
      const synth = window.speechSynthesis;

      const loadVoices = () => {
        const voices = synth.getVoices();
        const russianVoice = voices.find(voice => voice.lang.includes('ru'));

        if (russianVoice) {
          this.selectedVoice = russianVoice;
          console.log('Выбран русский голос:', russianVoice.name);
        } else {
          console.warn('Русский голос не найден');
        }
      };

      if (synth.getVoices().length === 0) {
        synth.onvoiceschanged = loadVoices;
      } else {
        loadVoices();
      }
    }
  };

  speak = (text: string) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
  
      if (this.selectedVoice) {
        utterance.voice = this.selectedVoice;
      }
  
      utterance.lang = 'ru-RU';
      utterance.rate = 1.5; 
      utterance.pitch = 1; 

      window.speechSynthesis.speak(utterance);
    } else {
      console.warn('Speech Synthesis не поддерживается в этом браузере.');
    }
  };

  playNotificationSound = () => {
    const audio = new Audio('/notification/notification-sound.mp3'); 
    audio.play();
    audio.onended = ()=>{
        this.speakAfterSound(); 
    }
  };

  speakAfterSound = () => {
    const message = this.state.messages[0];
    this.speak(message);
  };


  render() {
    return (
      <div>
        <ul className='m-2'>
          {this.state.messages.map((msg, index) => (
            <li key={index} className='p-1'>{new Date().toLocaleDateString() + " " + new Date().toLocaleTimeString() + " - " + msg}</li>
          ))}
        </ul>
      </div>
    );
  }
}

export default Chat;
