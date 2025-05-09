import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';
import { Sun, Moon, Calendar, Thermometer, Clock, Power, Sliders, RefreshCw } from 'lucide-react';

const App = () => {
  // State management
  const [data, setData] = useState([]);
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [darkMode, setDarkMode] = useState(false);
  const [relay1On, setRelay1On] = useState(false);
  const [relay2On, setRelay2On] = useState(false);
  const [lastUpdate, setLastUpdate] = useState('N/A');
  const [automaticMode, setAutomaticMode] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch initial data
  useEffect(() => {
    const fetchAllData = async () => {
      setIsLoading(true);
      try {
        // Get the last 24 hours of data
        const twentyFourHoursAgo = new Date();
        twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
        
        // Fetch sensor data
        const { data: sensorData, error: sensorError } = await supabase
          .from('sensor_data')
          .select('*')
          .gte('inserted_at', twentyFourHoursAgo.toISOString())
          .order('inserted_at', { ascending: true });

        if (sensorError) throw sensorError;
        if (sensorData) setData(sensorData);

        // Fetch relay states
        const { data: relay1Data, error: relay1Error } = await supabase
          .from('relay_control')
          .select('state')
          .eq('id', 1)
          .single();

        if (!relay1Error && relay1Data) setRelay1On(relay1Data.state);

        const { data: relay2Data, error: relay2Error } = await supabase
          .from('relay_control')
          .select('state')
          .eq('id', 2)
          .single();

        if (!relay2Error && relay2Data) setRelay2On(relay2Data.state);

        // Fetch system mode
        const { data: modeData, error: modeError } = await supabase
          .from('system_settings')
          .select('automatic_mode')
          .eq('id', 1)
          .single();

        if (!modeError && modeData) setAutomaticMode(modeData.automatic_mode);

        setLastUpdate(new Date().toLocaleTimeString());
        setError(null);
      } catch (err) {
        console.error('Initialization error:', err);
        setError('Failed to load initial data. Please refresh the page.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchAllData();
  }, []);

  // Realtime subscription setup
  useEffect(() => {
    const channel = supabase
      .channel('realtime-data')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'sensor_data',
        },
        (payload) => {
          setData(prev => {
            const twentyFourHoursAgo = new Date();
            twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
            const newData = [...prev, payload.new]
              .filter(item => new Date(item.inserted_at) >= twentyFourHoursAgo)
              .sort((a, b) => new Date(a.inserted_at) - new Date(b.inserted_at));
            return newData;
          });
          setLastUpdate(new Date().toLocaleTimeString());
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'relay_control',
        },
        (payload) => {
          if (payload.new.id === 1) setRelay1On(payload.new.state);
          if (payload.new.id === 2) setRelay2On(payload.new.state);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'system_settings',
        },
        (payload) => {
          if (payload.new.id === 1) setAutomaticMode(payload.new.automatic_mode);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Polling fallback mechanism
  useEffect(() => {
    const pollData = async () => {
      try {
        const twentyFourHoursAgo = new Date();
        twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

        // Check for new sensor data
        const { data: latestData } = await supabase
          .from('sensor_data')
          .select('inserted_at')
          .order('inserted_at', { ascending: false })
          .limit(1);

        if (latestData && latestData.length > 0) {
          const lastTimestamp = new Date(latestData[0].inserted_at).getTime();
          const currentLatest = data.length > 0 
            ? new Date(data[data.length - 1].inserted_at).getTime() 
            : 0;

          if (lastTimestamp > currentLatest) {
            const { data: newData } = await supabase
              .from('sensor_data')
              .select('*')
              .gte('inserted_at', twentyFourHoursAgo.toISOString())
              .order('inserted_at', { ascending: true });
            
            if (newData) setData(newData);
          }
        }

        // Check relay states
        const { data: relay1Data } = await supabase
          .from('relay_control')
          .select('state')
          .eq('id', 1)
          .single();
        
        if (relay1Data) setRelay1On(relay1Data.state);

        const { data: relay2Data } = await supabase
          .from('relay_control')
          .select('state')
          .eq('id', 2)
          .single();
        
        if (relay2Data) setRelay2On(relay2Data.state);

        setLastUpdate(new Date().toLocaleTimeString());
      } catch (err) {
        console.error('Polling error:', err);
      }
    };

    const interval = setInterval(pollData, 15000);
    return () => clearInterval(interval);
  }, [data]);

  // Data filtering and calculations
  const getFilteredData = () => {
    if (!startDate && !endDate) return data;
    
    return data.filter(item => {
      const itemDate = new Date(item.inserted_at);
      return (!startDate || itemDate >= startDate) && 
             (!endDate || itemDate <= endDate);
    });
  };

  const filteredData = getFilteredData();
  const latestReading = filteredData[filteredData.length - 1];
  const currentTemp = latestReading?.temperature || null;
  const avgTemp = filteredData.length > 0 
    ? (filteredData.reduce((sum, item) => sum + item.temperature, 0) / filteredData.length).toFixed(1)
    : '--';

  // Control functions
  const toggleRelay = async (relayId) => {
    if (automaticMode) {
      alert('Please switch to manual mode to control relays');
      return;
    }

    const currentState = relayId === 1 ? relay1On : relay2On;
    const newState = !currentState;

    try {
      const { error } = await supabase
        .from('relay_control')
        .update({ state: newState })
        .eq('id', relayId);

      if (error) throw error;

      if (relayId === 1) setRelay1On(newState);
      else setRelay2On(newState);
    } catch (err) {
      console.error('Error toggling relay:', err);
      alert('Failed to update relay state');
    }
  };

  const toggleMode = async () => {
    const newMode = !automaticMode;
    try {
      const { error } = await supabase
        .from('system_settings')
        .update({ automatic_mode: newMode })
        .eq('id', 1);

      if (error) throw error;

      setAutomaticMode(newMode);
    } catch (err) {
      console.error('Error changing mode:', err);
      alert('Failed to change system mode');
    }
  };

  // UI Components
  const renderHeader = () => (
    <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm sticky top-0 z-10">
      <div className="container mx-auto px-4 py-3 flex justify-between items-center">
        <div className="flex items-center">
          <button
            onClick={() => setDarkMode(!darkMode)}
            className={`p-2 rounded-full transition-colors ${
              darkMode 
                ? 'bg-gray-700 hover:bg-gray-600 text-yellow-300' 
                : 'bg-gray-100 hover:bg-gray-200 text-indigo-600'
            }`}
          >
            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <h1 className="ml-4 text-lg font-semibold">PT100 Temperature Monitor</h1>
        </div>
        
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Calendar size={16} className={darkMode ? 'text-gray-300' : 'text-gray-500'} />
            <DatePicker
              selected={startDate}
              onChange={date => setStartDate(date)}
              selectsStart
              startDate={startDate}
              endDate={endDate}
              placeholderText="Start date"
              className={`border rounded px-3 py-1.5 text-sm ${
                darkMode 
                  ? 'bg-gray-800 text-gray-200 border-gray-700' 
                  : 'bg-white border-gray-300'
              }`}
            />
            <span className="text-xs">to</span>
            <DatePicker
              selected={endDate}
              onChange={date => setEndDate(date)}
              selectsEnd
              startDate={startDate}
              endDate={endDate}
              minDate={startDate}
              placeholderText="End date"
              className={`border rounded px-3 py-1.5 text-sm ${
                darkMode 
                  ? 'bg-gray-800 text-gray-200 border-gray-700' 
                  : 'bg-white border-gray-300'
              }`}
            />
            {(startDate || endDate) && (
              <button 
                onClick={() => {
                  setStartDate(null);
                  setEndDate(null);
                }}
                className={`px-2 py-1 rounded text-xs ${
                  darkMode 
                    ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' 
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-800'
                }`}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );

  const renderControlPanel = () => (
    <div className="mb-6 p-4 rounded-lg bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4">
        <div className="flex items-center mb-4 md:mb-0">
          <Sliders size={20} className={darkMode ? 'text-blue-300' : 'text-blue-600'} />
          <span className="ml-2 text-lg font-medium">System Mode:</span>
          <span className={`ml-2 px-3 py-1 rounded text-sm font-medium ${
            automaticMode 
              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' 
              : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'
          }`}>
            {automaticMode ? 'AUTOMATIC' : 'MANUAL'}
          </span>
          <button 
            onClick={toggleMode}
            className={`ml-4 px-3 py-1.5 rounded text-sm ${
              darkMode 
                ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                : 'bg-blue-500 hover:bg-blue-600 text-white'
            }`}
          >
            Switch Mode
          </button>
        </div>
        
        <div className="flex items-center">
          <Clock size={20} className={darkMode ? 'text-blue-300' : 'text-blue-600'} />
          <span className="ml-2 font-medium">Last update: {lastUpdate}</span>
          <button 
            onClick={async () => {
              setIsLoading(true);
              try {
                const twentyFourHoursAgo = new Date();
                twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
                
                const { data: newData } = await supabase
                  .from('sensor_data')
                  .select('*')
                  .gte('inserted_at', twentyFourHoursAgo.toISOString())
                  .order('inserted_at', { ascending: true });
                
                if (newData) setData(newData);
                setLastUpdate(new Date().toLocaleTimeString());
              } catch (err) {
                console.error('Refresh error:', err);
              } finally {
                setIsLoading(false);
              }
            }}
            className={`ml-4 p-2 rounded-full ${
              darkMode 
                ? 'bg-gray-700 hover:bg-gray-600 text-blue-300' 
                : 'bg-gray-100 hover:bg-gray-200 text-blue-600'
            }`}
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        {/* Relay 1 Card */}
        <div className={`p-4 rounded-lg border ${
          relay1On 
            ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800' 
            : 'bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-700'
        }`}>
          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-medium">Relay 1 (0°C to 10°C)</h3>
              <p className="text-sm mt-1">
                {relay1On 
                  ? automaticMode 
                    ? 'ON (Automatic)' 
                    : 'ON (Manual)'
                  : automaticMode 
                    ? 'OFF (Automatic)' 
                    : 'OFF (Manual)'}
              </p>
              {currentTemp !== null && currentTemp >= 0 && currentTemp <= 10 && (
                <p className="text-sm mt-1 text-green-600 dark:text-green-400">
                  Current temp: {currentTemp.toFixed(1)}°C (in range)
                </p>
              )}
            </div>
            <div className="flex items-center">
              <Power size={20} className={relay1On ? 'text-green-500' : darkMode ? 'text-gray-400' : 'text-gray-500'} />
              <button
                onClick={() => toggleRelay(1)}
                disabled={automaticMode}
                className={`ml-2 relative inline-flex items-center h-5 rounded-full w-9 transition-colors ${
                  automaticMode ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                } ${relay1On ? 'bg-green-500' : darkMode ? 'bg-gray-600' : 'bg-gray-300'}`}
              >
                <span className={`inline-block w-4 h-4 transform transition-transform rounded-full bg-white ${
                  relay1On ? 'translate-x-4' : 'translate-x-1'
                }`} />
              </button>
            </div>
          </div>
        </div>
        
        {/* Relay 2 Card */}
        <div className={`p-4 rounded-lg border ${
          relay2On 
            ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800' 
            : 'bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-700'
        }`}>
          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-medium">Relay 2 (11°C to 20°C)</h3>
              <p className="text-sm mt-1">
                {relay2On 
                  ? automaticMode 
                    ? 'ON (Automatic)' 
                    : 'ON (Manual)'
                  : automaticMode 
                    ? 'OFF (Automatic)' 
                    : 'OFF (Manual)'}
              </p>
              {currentTemp !== null && currentTemp >= 11 && currentTemp <= 20 && (
                <p className="text-sm mt-1 text-green-600 dark:text-green-400">
                  Current temp: {currentTemp.toFixed(1)}°C (in range)
                </p>
              )}
            </div>
            <div className="flex items-center">
              <Power size={20} className={relay2On ? 'text-green-500' : darkMode ? 'text-gray-400' : 'text-gray-500'} />
              <button
                onClick={() => toggleRelay(2)}
                disabled={automaticMode}
                className={`ml-2 relative inline-flex items-center h-5 rounded-full w-9 transition-colors ${
                  automaticMode ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                } ${relay2On ? 'bg-green-500' : darkMode ? 'bg-gray-600' : 'bg-gray-300'}`}
              >
                <span className={`inline-block w-4 h-4 transform transition-transform rounded-full bg-white ${
                  relay2On ? 'translate-x-4' : 'translate-x-1'
                }`} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderTemperatureCards = () => (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
      <div className="p-4 rounded-lg shadow-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-16 h-16 -mt-6 -mr-6 rounded-full bg-pink-100 opacity-60 dark:opacity-10"></div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Current Temperature</h3>
          <Thermometer size={18} className="text-pink-500" />
        </div>
        <p className="text-2xl font-bold text-pink-600 dark:text-pink-400">
          {currentTemp !== null ? `${currentTemp.toFixed(1)}°C` : '--'}
        </p>
        <p className="mt-2 text-sm">
          {currentTemp !== null && currentTemp >= 0 && currentTemp <= 10 && 'In Relay 1 range (0-10°C)'}
          {currentTemp !== null && currentTemp >= 11 && currentTemp <= 20 && 'In Relay 2 range (11-20°C)'}
          {currentTemp !== null && (currentTemp < 0 || currentTemp > 20) && 'Outside control ranges'}
        </p>
      </div>
      
      <div className="p-4 rounded-lg shadow-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-16 h-16 -mt-6 -mr-6 rounded-full bg-green-100 opacity-60 dark:opacity-10"></div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Avg Temp (24h)</h3>
          <Thermometer size={18} className="text-green-500" />
        </div>
        <p className="text-2xl font-bold text-green-600 dark:text-green-400">{avgTemp}°C</p>
      </div>
      
      <div className="p-4 rounded-lg shadow-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-16 h-16 -mt-6 -mr-6 rounded-full bg-blue-100 opacity-60 dark:opacity-10"></div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Control Ranges</h3>
          <Sliders size={18} className="text-blue-500" />
        </div>
        <div className="space-y-2 mt-1">
          <div className="flex items-center">
            <div className={`w-3 h-3 rounded-full ${relay1On ? 'bg-green-500' : 'bg-gray-400'} mr-2`}></div>
            <span className="text-sm">Relay 1: 0°C to 10°C</span>
          </div>
          <div className="flex items-center">
            <div className={`w-3 h-3 rounded-full ${relay2On ? 'bg-green-500' : 'bg-gray-400'} mr-2`}></div>
            <span className="text-sm">Relay 2: 11°C to 20°C</span>
          </div>
        </div>
      </div>
    </div>
  );

  const renderChart = () => (
    <div className="p-4 rounded-lg shadow-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
      <h2 className="text-lg font-medium mb-4">Temperature Trends</h2>
      
      {filteredData.length === 0 ? (
        <div className="h-96 flex items-center justify-center text-gray-500 dark:text-gray-400">
          {isLoading ? 'Loading data...' : 'No temperature data available'}
        </div>
      ) : (
        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={filteredData}
              margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="tempGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={darkMode ? "#6366f1" : "#818cf8"} stopOpacity={0.8} />
                  <stop offset="95%" stopColor={darkMode ? "#6366f1" : "#818cf8"} stopOpacity={0.2} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? "#374151" : "#e5e7eb"} />
              <XAxis 
                dataKey="inserted_at" 
                tick={{ fill: darkMode ? "#9ca3af" : "#4b5563" }}
                tickFormatter={timestamp => {
                  const date = new Date(timestamp);
                  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                }}
                interval="preserveStartEnd"
                minTickGap={60}
              />
              <YAxis 
                tick={{ fill: darkMode ? "#9ca3af" : "#4b5563" }}
                domain={['auto', 'auto']}
                label={{ 
                  value: 'Temperature (°C)', 
                  angle: -90, 
                  position: 'insideLeft',
                  style: { fill: darkMode ? "#9ca3af" : "#4b5563" }
                }}
              />
              <Tooltip 
                formatter={(value) => [`${value.toFixed(1)}°C`, 'Temperature']}
                labelFormatter={(timestamp) => {
                  const date = new Date(timestamp);
                  return date.toLocaleString();
                }}
                contentStyle={{ 
                  backgroundColor: darkMode ? "#1f2937" : "#ffffff",
                  border: `1px solid ${darkMode ? "#374151" : "#e5e7eb"}`,
                  color: darkMode ? "#f3f4f6" : "#1f2937"
                }}
              />
              <Legend />
              
              {/* Temperature range reference lines */}
              <ReferenceLine y={0} stroke="#10b981" strokeDasharray="3 3" label={{ 
                value: 'Relay 1 Min', 
                position: 'insideTopLeft',
                fill: darkMode ? "#d1fae5" : "#047857",
                fontSize: 10 
              }} />
              <ReferenceLine y={10} stroke="#10b981" strokeDasharray="3 3" label={{ 
                value: 'Relay 1 Max', 
                position: 'insideTopLeft',
                fill: darkMode ? "#d1fae5" : "#047857",
                fontSize: 10 
              }} />
              <ReferenceLine y={11} stroke="#3b82f6" strokeDasharray="3 3" label={{ 
                value: 'Relay 2 Min', 
                position: 'insideTopLeft',
                fill: darkMode ? "#bfdbfe" : "#1e40af",
                fontSize: 10 
              }} />
              <ReferenceLine y={20} stroke="#3b82f6" strokeDasharray="3 3" label={{ 
                value: 'Relay 2 Max', 
                position: 'insideTopLeft',
                fill: darkMode ? "#bfdbfe" : "#1e40af",
                fontSize: 10 
              }} />
              
              <Area 
                type="monotone" 
                dataKey="temperature" 
                stroke={darkMode ? "#818cf8" : "#4f46e5"} 
                fillOpacity={1} 
                fill="url(#tempGradient)" 
                name="Temperature"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      
      <div className="mt-4 text-sm text-gray-500 dark:text-gray-400">
        {filteredData.length > 0 && (
          <p>
            Showing {filteredData.length} data point{filteredData.length !== 1 ? 's' : ''} from {
              new Date(filteredData[0].inserted_at).toLocaleString()
            } to {
              new Date(filteredData[filteredData.length - 1].inserted_at).toLocaleString()
            }
          </p>
        )}
      </div>
    </div>
  );

  const renderDataTable = () => (
    <div className="mt-6 p-4 rounded-lg shadow-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
      <details>
        <summary className="cursor-pointer text-lg font-medium focus:outline-none">
          Raw Temperature Data
        </summary>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead>
              <tr>
                <th className="px-6 py-3 bg-gray-50 dark:bg-gray-900 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Time</th>
                <th className="px-6 py-3 bg-gray-50 dark:bg-gray-900 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Temperature (°C)</th>
                <th className="px-6 py-3 bg-gray-50 dark:bg-gray-900 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Control Status</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {filteredData.slice(-20).reverse().map((item, index) => (
                <tr key={index} className={index % 2 === 0 ? 'bg-gray-50 dark:bg-gray-900/50' : ''}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {new Date(item.inserted_at).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`text-sm font-medium ${
                      item.temperature >= 0 && item.temperature <= 10
                        ? 'text-green-600 dark:text-green-400'
                        : item.temperature >= 11 && item.temperature <= 20
                          ? 'text-blue-600 dark:text-blue-400'
                          : 'text-gray-800 dark:text-gray-200'
                    }`}>
                      {item.temperature.toFixed(1)}°C
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {item.temperature >= 0 && item.temperature <= 10 && (
                      <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
                        Relay 1 Range (0-10°C)
                      </span>
                    )}
                    {item.temperature >= 11 && item.temperature <= 20 && (
                      <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300">
                        Relay 2 Range (11-20°C)
                      </span>
                    )}
                    {(item.temperature < 0 || item.temperature > 20) && (
                      <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                        Outside Control Range
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredData.length > 20 && (
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Showing only the last 20 records. {filteredData.length - 20} more record(s) available.
            </p>
          )}
        </div>
      </details>
    </div>
  );

  const renderFooter = () => (
    <footer className="mt-8 py-4 border-t border-gray-200 dark:border-gray-700">
      <div className="container mx-auto px-4 text-center text-sm text-gray-500 dark:text-gray-400">
        <p>PT100 Temperature Monitoring System &copy; {new Date().getFullYear()}</p>
        <p className="mt-1">Built with React and Supabase</p>
      </div>
    </footer>
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-100 transition-colors duration-300">
      {renderHeader()}
      
      <main className="container mx-auto px-4 py-6">
        {error && (
          <div className="mb-4 p-4 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300">
            {error}
          </div>
        )}
        
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        ) : (
          <>
            {renderControlPanel()}
            {renderTemperatureCards()}
            {renderChart()}
            {renderDataTable()}
          </>
        )}
      </main>
      
      {renderFooter()}
    </div>
  );
};

export default App;