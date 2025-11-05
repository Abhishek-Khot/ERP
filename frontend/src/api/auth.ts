import { LoginPayload, AuthUser } from '../auth/types';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5050/api';

type LoginResponse = { token: string; user: AuthUser };

export async function loginApi(payload: LoginPayload): Promise<LoginResponse> {
  try {
    // If schoolCode is provided, always use school-login
    if (payload.schoolCode) {
      return await schoolLogin(payload);
    }
    
    // If no schoolCode, try regular login first (for SuperAdmin)
    try {
      return await regularLogin(payload);
    } catch (error) {
      // If regular login fails and role suggests school user, try school login
      const isSchoolUser = payload.role === 'admin' || payload.role === 'teacher' || payload.role === 'student' || payload.role === 'parent';
      if (isSchoolUser && payload.schoolCode) {
        return await schoolLogin(payload);
      }
      throw error;
    }
  } catch (err) {
    console.error('[LOGIN ERROR]', err);
    throw err;
  }
}

async function regularLogin(payload: LoginPayload): Promise<LoginResponse> {
  const endpoint = `${API_BASE}/auth/login`;
  
  console.log(`[LOGIN] Trying regular login for: ${payload.email}`);

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: payload.email,
      password: payload.password,
      role: payload.role
    })
  });
  
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    const msg = errorData.message || 'Login failed';
    console.error('[REGULAR LOGIN FAIL]', msg);
    throw new Error(msg);
  }
  
  const data = await res.json() as {
    token: string;
    user: {
      _id?: string;
      id?: string;
      userId?: string;
      name: any;
      email: string;
      role: string;
      schoolId?: string;
      schoolName?: string;
      lastLogin?: string;
    };
  };

  // Normalize role to lowercase to match frontend types
  const roleLc = String(data.user.role || '').toLowerCase();

  // Normalize name to a display string if backend returns an object
  const nameVal = data.user?.name;
  const displayName = typeof nameVal === 'string'
    ? nameVal
    : nameVal && typeof nameVal === 'object'
      ? [nameVal.firstName, nameVal.middleName, nameVal.lastName].filter(Boolean).join(' ').trim() || data.user.email
      : data.user.email;

  const mappedUser: AuthUser = {
    id: data.user._id || data.user.id || '',
    userId: data.user.userId,
    name: displayName,
    email: data.user.email,
    role: (roleLc as AuthUser['role']),
    schoolId: data.user.schoolId,
    schoolName: data.user.schoolName,
    lastLogin: data.user.lastLogin
  };

  console.log('[REGULAR LOGIN SUCCESS]', mappedUser);
  return { token: data.token, user: mappedUser };
}

async function schoolLogin(payload: LoginPayload): Promise<LoginResponse> {
  if (!payload.schoolCode) {
    throw new Error('School code is required for school login');
  }
  
  const endpoint = `${API_BASE}/auth/school-login`;
  
  console.log(`[LOGIN] Trying school login for: ${payload.email} at school: ${payload.schoolCode}`);

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identifier: payload.email,
      password: payload.password,
      schoolCode: payload.schoolCode,
      role: payload.role
    })
  });
  
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    const msg = errorData.message || 'Login failed';
    console.error('[SCHOOL LOGIN FAIL]', msg);
    throw new Error(msg);
  }
  
  const data = await res.json() as {
    token: string;
    user: {
      _id?: string;
      id?: string;
      userId?: string;
      name: any;
      email: string;
      role: string;
      schoolCode?: string;
      isActive?: boolean;
      lastLogin?: string;
      permissions?: any;
    };
  };

  // Normalize role to lowercase to match frontend types
  const roleLc = String(data.user.role || '').toLowerCase();

  // Normalize name to a display string if backend returns an object
  const nameVal = data.user?.name;
  const displayName = typeof nameVal === 'string'
    ? nameVal
    : nameVal && typeof nameVal === 'object'
      ? [nameVal.firstName, nameVal.middleName, nameVal.lastName].filter(Boolean).join(' ').trim() || data.user.email
      : data.user.email;

  console.log('[SCHOOL LOGIN DEBUG] Raw response data.user:', data.user);
  console.log('[SCHOOL LOGIN DEBUG] data.user.userId specifically:', data.user.userId);
  console.log('[SCHOOL LOGIN DEBUG] data.user keys:', Object.keys(data.user));

  const mappedUser: AuthUser = {
    id: data.user._id || data.user.id || '',
    userId: data.user.userId,
    name: displayName,
    email: data.user.email,
    role: (roleLc as AuthUser['role']),
    schoolId: data.user.schoolCode, // Map schoolCode to schoolId for consistency
    schoolCode: data.user.schoolCode,
    schoolName: data.user.schoolCode, // Use schoolCode as schoolName if not provided
    lastLogin: data.user.lastLogin
  };

  console.log('[SCHOOL LOGIN SUCCESS] Mapped user:', mappedUser);
  console.log('[SCHOOL LOGIN SUCCESS] Mapped user.userId:', mappedUser.userId);
  return { token: data.token, user: mappedUser };
}

