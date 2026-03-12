import { useEffect, useRef, useState, RefObject } from 'react';
import { useLocation } from 'react-router-dom';

interface PageState {
  scrollPosition: number;
  searchQuery: string;
}

const PAGE_STATE_KEY = 'clastone_page_state';

export function usePageState<T extends HTMLElement = HTMLDivElement>(pageKey: string) {
  const location = useLocation();
  const scrollContainerRef = useRef<T>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isRestoring, setIsRestoring] = useState(false);

  // Load page state on mount
  useEffect(() => {
    const savedState = sessionStorage.getItem(PAGE_STATE_KEY);
    if (savedState) {
      try {
        const allStates: Record<string, PageState> = JSON.parse(savedState);
        const pageState = allStates[pageKey];
        
        if (pageState) {
          setSearchQuery(pageState.searchQuery || '');
          setIsRestoring(true);
          
          // Restore scroll position after a short delay to ensure content is rendered
          const timer = setTimeout(() => {
            if (scrollContainerRef.current) {
              scrollContainerRef.current.scrollTop = pageState.scrollPosition || 0;
            }
            setIsRestoring(false);
          }, 100);
          
          return () => clearTimeout(timer);
        }
      } catch (error) {
        console.warn('Failed to parse page state:', error);
      }
    }
  }, [pageKey]);

  // Save scroll position and search query
  const savePageState = (scrollPos: number, query: string) => {
    try {
      const savedState = sessionStorage.getItem(PAGE_STATE_KEY);
      const allStates: Record<string, PageState> = savedState ? JSON.parse(savedState) : {};
      
      allStates[pageKey] = {
        scrollPosition: scrollPos,
        searchQuery: query
      };
      
      sessionStorage.setItem(PAGE_STATE_KEY, JSON.stringify(allStates));
    } catch (error) {
      console.warn('Failed to save page state:', error);
    }
  };

  // Handle scroll events
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (!isRestoring) {
        savePageState(container.scrollTop, searchQuery);
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [pageKey, searchQuery, isRestoring]);

  // Handle search query changes
  useEffect(() => {
    if (!isRestoring) {
      const container = scrollContainerRef.current;
      const scrollPos = container ? container.scrollTop : 0;
      savePageState(scrollPos, searchQuery);
    }
  }, [searchQuery, pageKey, isRestoring]);

  // Clean up state when leaving page (optional - uncomment if you want to clear state on navigation)
  // useEffect(() => {
  //   return () => {
  //     try {
  //       const savedState = sessionStorage.getItem(PAGE_STATE_KEY);
  //       if (savedState) {
  //         const allStates: Record<string, PageState> = JSON.parse(savedState);
  //         delete allStates[pageKey];
  //         sessionStorage.setItem(PAGE_STATE_KEY, JSON.stringify(allStates));
  //       }
  //     } catch (error) {
  //       console.warn('Failed to clear page state:', error);
  //     }
  //   };
  // }, [pageKey]);

  return {
    scrollContainerRef: scrollContainerRef as RefObject<T>,
    searchQuery,
    setSearchQuery,
    isRestoring
  };
}
