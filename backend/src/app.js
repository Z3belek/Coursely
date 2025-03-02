const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const puppeteer = require('puppeteer');
const https = require('https');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const compression = require('compression');
const { body, validationResult } = require('express-validator');
const cacheManager = require('cache-manager');
const crypto = require('crypto'); // Módulo nativo de Node.js

// Acceder a createCache usando require
const { createCache } = cacheManager;

// Configuración inicial
const port = process.env.BACKEND_PORT || 4000;
const host = process.env.BACKEND_HOST || '192.168.0.220';

// Directorios
const videosDir = path.join(__dirname, '..', '..', 'videos');
const publicDir = path.join(__dirname, '..', 'public');
const dbPath = path.join(__dirname, '..', 'database', 'profiles.db');

// Inicializar caché con cache-manager (memoria por defecto)
const cache = createCache({
  ttl: 600 * 1000, // Tiempo de vida en milisegundos (10 minutos ≡ 600 segundos)
});

// Asegurar directorios
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

// Configuración de Express y middleware
const app = express();
app.use(cors());
app.use(compression());
app.use(express.json());
app.use('/public', express.static(publicDir));

const upload = multer({ dest: 'uploads/' });

// Conexión a la base de datos
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error al conectar con la base de datos:', err.message);
    process.exit(1);
  }
  console.log('Conexión exitosa a la base de datos');

  db.serialize(() => {
    // Crear tablas e índices
    db.run(`
      CREATE TABLE IF NOT EXISTS courses (
        folderName TEXT PRIMARY KEY,
        courseName TEXT,
        courseDesc TEXT,
        imagePath TEXT,
        courseProvider TEXT CHECK(courseProvider IN ('udemy', 'other', NULL)),
        courseInstructors TEXT,
        courseRating REAL DEFAULT 0,
        courseUpdate TEXT,
        courseLocale TEXT,
        courseHours REAL DEFAULT 0,
        courseHash TEXT DEFAULT '',
        courseFilled INTEGER DEFAULT 0,
        UNIQUE (folderName)
      )
    `);
    db.run('CREATE INDEX IF NOT EXISTS idx_courses_folderName ON courses(folderName)');

    db.run(`
      CREATE TABLE IF NOT EXISTS profiles (
        profileName TEXT PRIMARY KEY
      )
    `);
    db.run('CREATE INDEX IF NOT EXISTS idx_profiles_profileName ON profiles(profileName)');

    db.run(`
      CREATE TABLE IF NOT EXISTS progress (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profileName TEXT NOT NULL,
        folderName TEXT NOT NULL,
        section TEXT NOT NULL,
        video TEXT NOT NULL,
        position REAL DEFAULT 0,
        FOREIGN KEY (profileName) REFERENCES profiles(profileName),
        FOREIGN KEY (folderName) REFERENCES courses(folderName)
      )
    `);
    db.run('CREATE INDEX IF NOT EXISTS idx_progress_folderName_profileName ON progress(folderName, profileName)');

    syncCourses(true);
  });
});

// Promesas para operaciones de base de datos
const dbGet = (query, params) => new Promise((resolve, reject) => {
  db.get(query, params, (err, row) => (err ? reject(err) : resolve(row)));
});

const dbRun = (query, params) => new Promise((resolve, reject) => {
  db.run(query, params, function (err) {
    if (err) reject(err);
    else resolve(this.changes);
  });
});

const dbAll = (query, params) => new Promise((resolve, reject) => {
  db.all(query, params, (err, rows) => (err ? reject(err) : resolve(rows)));
});

// Función para obtener la duración de un video en segundos
async function getVideoDuration(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) reject(err);
      else resolve(metadata.format.duration || 0);
    });
  });
}

// Función para calcular las horas totales de un curso (paralelizado)
async function calculateCourseHours(folderName) {
  const sectionsDir = path.join(videosDir, folderName);
  let totalSeconds = 0;

  try {
    const sections = fs.readdirSync(sectionsDir).filter((subfolder) =>
      fs.statSync(path.join(sectionsDir, subfolder)).isDirectory()
    );

    for (const section of sections) {
      const sectionDir = path.join(sectionsDir, section);
      const videos = fs.readdirSync(sectionDir).filter((file) => file.endsWith('.mp4'));
      const durations = await Promise.all(
        videos.map(async (video) => {
          const videoPath = path.join(sectionDir, video);
          return getVideoDuration(videoPath);
        })
      );
      totalSeconds += durations.reduce((sum, duration) => sum + duration, 0);
    }

    const totalHours = totalSeconds / 3600;
    return Math.round(totalHours * 10) / 10; // Redondear a 1 decimal
  } catch (err) {
    console.error(`Error al calcular horas para ${folderName}:`, err.message);
    return 0;
  }
}

// Función para generar un hash basado en los archivos de video de un curso (paralelizado)
async function generateCourseHash(folderName) {
  const sectionsDir = path.join(videosDir, folderName);
  let fileStats = [];

  try {
    const sections = fs.readdirSync(sectionsDir).filter((subfolder) =>
      fs.statSync(path.join(sectionsDir, subfolder)).isDirectory()
    );

    for (const section of sections) {
      const sectionDir = path.join(sectionsDir, section);
      const videos = fs.readdirSync(sectionDir).filter((file) => file.endsWith('.mp4'));
      const statsPromises = videos.map((video) => {
        const videoPath = path.join(sectionDir, video);
        const stats = fs.statSync(videoPath);
        return `${videoPath}:${stats.size}:${stats.mtimeMs}`;
      });
      fileStats.push(...statsPromises);
    }

    const hash = fileStats.sort().join('|');
    return crypto.createHash('md5').update(hash).digest('hex');
  } catch (err) {
    console.error(`Error al generar hash para ${folderName}:`, err.message);
    return '';
  }
}

// Función para sincronizar cursos (solo escaneo de archivos, sin cálculo de horas)
async function syncCourses(initial = false) {
  try {
    const existingCourses = await dbAll('SELECT folderName, courseHash FROM courses', []);
    const existingFolderNames = new Set(existingCourses.map(course => course.folderName));

    const folders = fs.readdirSync(videosDir).filter((folder) =>
      fs.statSync(path.join(videosDir, folder)).isDirectory()
    );
    const folderNames = new Set(folders);

    const newCourses = [];
    await dbRun('BEGIN TRANSACTION');
    try {
      for (const folder of folders) {
        const currentHash = await generateCourseHash(folder);
        const existingCourse = existingCourses.find(course => course.folderName === folder);

        if (!existingFolderNames.has(folder)) {
          await dbRun(
            'INSERT INTO courses (folderName, courseName, courseDesc, imagePath, courseProvider, courseInstructors, courseRating, courseUpdate, courseLocale, courseHours, courseHash, courseFilled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [folder, folder, null, null, null, null, 0, null, null, 0, currentHash, 0]
          );
          newCourses.push({ folderName: folder });
        } else if (existingCourse.courseHash !== currentHash) {
          await dbRun('UPDATE courses SET courseHash = ? WHERE folderName = ?', [currentHash, folder]);
        }
      }

      for (const course of existingCourses) {
        if (!folderNames.has(course.folderName)) {
          await dbRun('DELETE FROM courses WHERE folderName = ?', [course.folderName]);
        }
      }
      await dbRun('COMMIT');
    } catch (err) {
      await dbRun('ROLLBACK');
      throw err;
    }

    await cache.del('courses');
    return newCourses;
  } catch (err) {
    console.error(`Error en la sincronización ${initial ? 'inicial' : 'manual'}:`, err.message);
    throw err;
  }
}

// Función para calcular las horas de cursos modificados o con horas 0
async function calculateHoursForModifiedCourses() {
  try {
    const courses = await dbAll('SELECT folderName, courseHours, courseHash FROM courses', []);
    const updatedCourses = [];

    for (const course of courses) {
      const { folderName, courseHours, courseHash } = course;
      const currentHash = await generateCourseHash(folderName);

      if (courseHours === 0 || currentHash !== courseHash) {
        const newHours = await calculateCourseHours(folderName);
        await dbRun(
          'UPDATE courses SET courseHours = ?, courseHash = ? WHERE folderName = ?',
          [newHours, currentHash, folderName]
        );
        updatedCourses.push({ folderName, courseHours: newHours });
      }
    }

    await cache.del('courses');
    return updatedCourses;
  } catch (err) {
    console.error('Error al calcular horas:', err.message);
    throw err;
  }
}

// Función para descargar una imagen y convertirla a PNG
async function downloadImage(url, folderName) {
  return new Promise((resolve, reject) => {
    const tempName = `${Date.now()}-${folderName}-temp`;
    const tempPath = path.join(publicDir, tempName);
    const imageName = `${Date.now()}-${folderName}.png`;
    const imagePathFull = path.join(publicDir, imageName);

    const file = fs.createWriteStream(tempPath);
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Error al descargar la imagen: ${response.statusCode}`));
        return;
      }

      response.pipe(file);
      file.on('finish', async () => {
        file.close();
        try {
          await sharp(tempPath).png().toFile(imagePathFull);
          fs.unlinkSync(tempPath);
          resolve(`http://${host}:${port}/public/${imageName}`);
        } catch (err) {
          fs.unlinkSync(tempPath);
          reject(err);
        }
      });
    }).on('error', (err) => {
      fs.unlinkSync(tempPath);
      reject(err);
    });
  });
}

// Función para obtener datos públicos de Udemy con Puppeteer
async function getUdemyCourseData(folderName) {
  const url = `https://www.udemy.com/course/${folderName}/`;
  let browser;

  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(url, { waitUntil: 'networkidle2' });

    const udemyData = await page.evaluate(() => {
      const courseName = document.querySelector('h1[data-purpose="lead-title"]')?.innerText.trim() || null;
      const courseDesc = document.querySelector('div[data-purpose="lead-headline"]')?.innerText.trim() || null;
      const instructorContainer = document.querySelector('span.instructor-links--names--fJWai');
      const courseInstructors = instructorContainer ? instructorContainer.innerText : null;
      const courseRating = document.querySelector('span[data-purpose="rating-number"]')?.innerText.trim() || null;
      const courseUpdate = document.querySelector('div[data-purpose="last-update-date"]')?.innerText.trim() || null;
      const courseLocale = document.querySelector('div[data-purpose="lead-course-locale"]')?.innerText.trim() || null;

      const imageElement = document.querySelector('span.intro-asset--img-aspect--3gluH img');
      let imageUrl = null;
      if (imageElement && imageElement.srcset) {
        const srcsetOptions = imageElement.srcset.split(',').map(option => {
          const [url, size] = option.trim().split(' ');
          const width = parseInt(size.replace('w', ''), 10);
          return { url, width };
        });
        const largestImage = srcsetOptions.sort((a, b) => b.width - a.width)[0];
        imageUrl = largestImage ? largestImage.url : imageElement.src;
      } else {
        imageUrl = imageElement ? imageElement.src : null;
      }

      return { courseName, courseDesc, imageUrl, courseInstructors, courseRating, courseUpdate, courseLocale };
    });

    if (!udemyData.courseName) {
      return {
        courseName: folderName,
        courseDesc: null,
        imagePath: null,
        courseInstructors: null,
        courseRating: 0,
        courseUpdate: null,
        courseLocale: null,
      };
    }

    udemyData.courseRating = udemyData.courseRating ? parseFloat(udemyData.courseRating.replace(',', '.')) : 0;
    const imagePath = udemyData.imageUrl ? await downloadImage(udemyData.imageUrl, folderName) : null;
    udemyData.imagePath = imagePath;
    delete udemyData.imageUrl;

    return udemyData;
  } catch (error) {
    console.error(`Error al scrapear datos de Udemy para ${folderName}:`, error.message);
    return {
      courseName: folderName,
      courseDesc: null,
      imagePath: null,
      courseInstructors: null,
      courseRating: 0,
      courseUpdate: null,
      courseLocale: null,
      error: error.message,
    };
  } finally {
    if (browser) await browser.close();
  }
}

// Endpoint para actualizar cursos (actualización parcial)
app.put('/courses/:folderName', upload.single('image'), [
  body('courseName').optional().trim().notEmpty(),
  body('courseProvider').optional().isIn(['udemy', 'other', '']),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { folderName } = req.params;
  const { courseName, courseDesc, courseProvider, courseInstructors, courseRating, courseUpdate, courseLocale } = req.body;

  try {
    const currentCourse = await dbGet('SELECT * FROM courses WHERE folderName = ?', [folderName]);
    if (!currentCourse && !courseName) {
      return res.status(400).json({ error: 'Se requiere courseName para crear un nuevo curso' });
    }

    let imagePath = currentCourse?.imagePath || null;
    if (req.body.image === '' && !req.file) {
      if (currentCourse?.imagePath) {
        const oldImagePath = path.join(publicDir, path.basename(currentCourse.imagePath));
        if (fs.existsSync(oldImagePath)) fs.unlinkSync(oldImagePath);
      }
      imagePath = null;
    } else if (req.file) {
      if (currentCourse?.imagePath) {
        const oldImagePath = path.join(publicDir, path.basename(currentCourse.imagePath));
        if (fs.existsSync(oldImagePath)) fs.unlinkSync(oldImagePath);
      }
      const imageName = `${Date.now()}-${req.file.originalname.replace(/\s/g, '-')}`;
      const imagePathFull = path.join(publicDir, imageName);
      fs.renameSync(req.file.path, imagePathFull);
      imagePath = `http://${host}:${port}/public/${imageName}`;
    }

    const fieldsToUpdate = {};
    if (courseName !== undefined) fieldsToUpdate.courseName = courseName || null;
    if (courseDesc !== undefined) fieldsToUpdate.courseDesc = courseDesc || null;
    if (courseProvider !== undefined) fieldsToUpdate.courseProvider = courseProvider || null;
    if (courseInstructors !== undefined) fieldsToUpdate.courseInstructors = courseInstructors || null;
    if (courseRating !== undefined) fieldsToUpdate.courseRating = courseRating ? parseFloat(courseRating.replace(',', '.')) : 0;
    if (courseUpdate !== undefined) fieldsToUpdate.courseUpdate = courseUpdate || null;
    if (courseLocale !== undefined) fieldsToUpdate.courseLocale = courseLocale || null;
    if (imagePath !== currentCourse?.imagePath) fieldsToUpdate.imagePath = imagePath;

    if (!Object.keys(fieldsToUpdate).length) {
      return res.status(400).json({ error: 'No se proporcionaron campos para actualizar' });
    }

    if (currentCourse) {
      const setClause = Object.keys(fieldsToUpdate).map((key) => `${key} = ?`).join(', ');
      const values = [...Object.values(fieldsToUpdate), folderName];
      const changes = await dbRun(`UPDATE courses SET ${setClause} WHERE folderName = ?`, values);

      if (changes === 0) {
        return res.status(404).json({ error: 'Curso no encontrado' });
      }
    } else {
      const allFields = {
        folderName,
        courseName: null,
        courseDesc: null,
        imagePath: null,
        courseProvider: null,
        courseInstructors: null,
        courseRating: 0,
        courseUpdate: null,
        courseLocale: null,
        courseHours: 0,
        courseHash: '',
        courseFilled: 0,
        ...fieldsToUpdate,
      };
      await dbRun(
        'INSERT INTO courses (folderName, courseName, courseDesc, imagePath, courseProvider, courseInstructors, courseRating, courseUpdate, courseLocale, courseHours, courseHash, courseFilled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        Object.values(allFields)
      );
    }

    await cache.del('courses');
    res.json({ message: 'Curso actualizado', folderName, imagePath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint para obtener datos de un curso
app.get('/courses/:folderName', async (req, res) => {
  const { folderName } = req.params;

  try {
    const course = await dbGet('SELECT * FROM courses WHERE folderName = ?', [folderName]);
    if (!course) {
      return res.status(404).json({ error: 'Curso no encontrado' });
    }

    const sections = fs.readdirSync(path.join(videosDir, folderName)).filter((subfolder) =>
      fs.statSync(path.join(videosDir, folderName, subfolder)).isDirectory()
    );
    const sectionsInfo = sections.map((section) => {
      const videos = fs.readdirSync(path.join(videosDir, folderName, section)).filter((file) => file.endsWith('.mp4'));
      return {
        sectionName: section,
        videos: videos.map((video) => ({
          videoName: video,
          order: video.split(' ')[0],
          url: `http://${host}:${port}/video/${encodeURIComponent(folderName)}/${encodeURIComponent(section)}/${encodeURIComponent(video.replace('.mp4', ''))}`,
        })),
      };
    });

    res.json({ ...course, sections: sectionsInfo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint para sincronizar datos de Udemy (solo cursos con courseFilled = false)
app.post('/courses/sync-udemy-pending', async (req, res) => {
  try {
    const courses = await dbAll('SELECT folderName, courseProvider, imagePath FROM courses WHERE courseProvider = "udemy" AND courseFilled = 0', []);
    const updatedCourses = [];

    for (const course of courses) {
      const { folderName, imagePath: oldImagePath } = course;
      const udemyData = await getUdemyCourseData(folderName);

      if (oldImagePath && udemyData.imagePath && oldImagePath !== udemyData.imagePath) {
        const oldImageFullPath = path.join(publicDir, path.basename(oldImagePath));
        if (fs.existsSync(oldImageFullPath)) fs.unlinkSync(oldImageFullPath);
      }

      await dbRun(
        'UPDATE courses SET courseName = ?, courseDesc = ?, imagePath = ?, courseInstructors = ?, courseRating = ?, courseUpdate = ?, courseLocale = ?, courseFilled = 1 WHERE folderName = ?',
        [
          udemyData.courseName,
          udemyData.courseDesc,
          udemyData.imagePath,
          udemyData.courseInstructors,
          udemyData.courseRating,
          udemyData.courseUpdate,
          udemyData.courseLocale,
          folderName,
        ]
      );
      updatedCourses.push({ folderName, ...udemyData });

      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    await cache.del('courses');
    res.json({
      message: updatedCourses.length ? 'Cursos pendientes de Udemy sincronizados' : 'No había cursos pendientes',
      updatedCourses,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint para sincronizar datos de Udemy forzadamente (ignora courseFilled)
app.post('/courses/sync-udemy-forced', async (req, res) => {
  try {
    const courses = await dbAll('SELECT folderName, courseProvider, imagePath FROM courses WHERE courseProvider = "udemy"', []);
    const updatedCourses = [];

    for (const course of courses) {
      const { folderName, imagePath: oldImagePath } = course;
      const udemyData = await getUdemyCourseData(folderName);

      if (oldImagePath && udemyData.imagePath && oldImagePath !== udemyData.imagePath) {
        const oldImageFullPath = path.join(publicDir, path.basename(oldImagePath));
        if (fs.existsSync(oldImageFullPath)) fs.unlinkSync(oldImageFullPath);
      }

      await dbRun(
        'UPDATE courses SET courseName = ?, courseDesc = ?, imagePath = ?, courseInstructors = ?, courseRating = ?, courseUpdate = ?, courseLocale = ?, courseFilled = 1 WHERE folderName = ?',
        [
          udemyData.courseName,
          udemyData.courseDesc,
          udemyData.imagePath,
          udemyData.courseInstructors,
          udemyData.courseRating,
          udemyData.courseUpdate,
          udemyData.courseLocale,
          folderName,
        ]
      );
      updatedCourses.push({ folderName, ...udemyData });

      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    await cache.del('courses');
    res.json({
      message: updatedCourses.length ? 'Sincronización forzada de Udemy completada' : 'No había cursos para sincronizar',
      updatedCourses,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint para listar cursos (sin sincronización)
app.get('/courses', async (req, res) => {
  try {
    const cachedCourses = await cache.get('courses');
    if (cachedCourses) return res.json(cachedCourses);

    const courses = await dbAll('SELECT folderName, courseName, courseDesc, imagePath, courseProvider, courseInstructors, courseRating, courseUpdate, courseLocale, courseHours, courseFilled FROM courses', []);
    const updatedCourses = courses.map(course => ({
      folderName: course.folderName,
      courseName: course.courseName || null,
      courseDesc: course.courseDesc || null,
      imagePath: course.imagePath || null,
      courseProvider: course.courseProvider || null,
      courseInstructors: course.courseInstructors || null,
      courseRating: course.courseRating || 0,
      courseUpdate: course.courseUpdate || null,
      courseLocale: course.courseLocale || null,
      courseHours: course.courseHours || 0,
      courseFilled: !!course.courseFilled,
    }));

    await cache.set('courses', updatedCourses, 600 * 1000); // TTL en milisegundos
    res.json(updatedCourses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint para sincronizar archivos (solo escaneo)
app.post('/courses/sync', async (req, res) => {
  try {
    const newCourses = await syncCourses(false);
    res.json({ message: 'Sincronización de archivos completada', newCourses });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint para calcular horas de cursos modificados o con horas 0
app.post('/courses/calculate-hours', async (req, res) => {
  try {
    const updatedCourses = await calculateHoursForModifiedCourses();
    res.json({
      message: updatedCourses.length ? 'Horas calculadas y actualizadas' : 'No había cursos para actualizar',
      updatedCourses,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint para listar perfiles
app.get('/profiles', async (req, res) => {
  try {
    const rows = await dbAll('SELECT profileName FROM profiles', []);
    res.json(rows.map(row => row.profileName));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint para crear un perfil
app.post('/profiles', [
  body('profileName').notEmpty().trim().isLength({ min: 1, max: 50 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { profileName } = req.body;
  try {
    await dbRun('INSERT OR IGNORE INTO profiles (profileName) VALUES (?)', [profileName]);
    res.json({ message: `Perfil ${profileName} creado/seleccionado`, profile: profileName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint para editar un perfil
app.put('/profiles/:oldProfileName', [
  body('newProfileName').notEmpty().trim().isLength({ min: 1, max: 50 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { oldProfileName } = req.params;
  const { newProfileName } = req.body;
  try {
    await dbRun('UPDATE profiles SET profileName = ? WHERE profileName = ?', [newProfileName, oldProfileName]);
    await dbRun('UPDATE progress SET profileName = ? WHERE profileName = ?', [newProfileName, oldProfileName]);
    res.json({ message: `Perfil ${oldProfileName} actualizado a ${newProfileName}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint para eliminar un perfil
app.delete('/profiles/:profileName', async (req, res) => {
  const { profileName } = req.params;
  try {
    await dbRun('DELETE FROM progress WHERE profileName = ?', [profileName]);
    await dbRun('DELETE FROM profiles WHERE profileName = ?', [profileName]);
    res.json({ message: `Perfil ${profileName} eliminado` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint para obtener el progreso de un perfil en un curso
app.get('/profiles/:profileName/progress/:folderName', async (req, res) => {
  const { profileName, folderName } = req.params;

  try {
    const rows = await dbAll(
      'SELECT section, video, position FROM progress WHERE profileName = ? AND folderName = ? ORDER BY id DESC LIMIT 1',
      [profileName, folderName]
    );

    if (rows.length) {
      const row = rows[0];
      return res.json(row);
    }

    const sectionsDir = path.join(videosDir, folderName);
    const sections = fs.readdirSync(sectionsDir).filter((subfolder) =>
      fs.statSync(path.join(sectionsDir, subfolder)).isDirectory()
    ).sort();

    if (!sections.length) return res.json({ section: '', video: '', position: 0 });

    const firstSection = sections[0];
    const sectionDir = path.join(sectionsDir, firstSection);
    const videos = fs.readdirSync(sectionDir).filter(file => file.endsWith('.mp4')).sort();
    const firstVideo = videos[0] || '';

    if (firstVideo) {
      await dbRun(
        'INSERT INTO progress (profileName, folderName, section, video, position) VALUES (?, ?, ?, ?, ?)',
        [profileName, folderName, firstSection, firstVideo, 0]
      );
      return res.json({ section: firstSection, video: firstVideo, position: 0 });
    }

    res.json({ section: '', video: '', position: 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint para guardar el progreso de un perfil en un curso
app.post('/profiles/:profileName/progress/:folderName', [
  body('section').notEmpty(),
  body('video').notEmpty(),
  body('position').isFloat({ min: 0 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { profileName, folderName } = req.params;
  const { section, video, position } = req.body;

  try {
    await dbRun(
      'INSERT OR REPLACE INTO progress (profileName, folderName, section, video, position) VALUES (?, ?, ?, ?, ?)',
      [profileName, folderName, section, video, position]
    );
    res.json({ message: 'Progreso guardado', progress: { section, video, position } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint para streaming de video (sin HLS ni transcodificación)
app.get('/video/:folderName/:section/:video', (req, res) => {
  const { folderName, section, video } = req.params;
  const videoPath = path.join(videosDir, folderName, section, `${video}.mp4`);

  if (!fs.existsSync(videoPath)) return res.status(404).send('Video no encontrado');

  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Accept-Ranges', 'bytes');

  const range = req.headers.range;
  if (range) {
    const videoSize = fs.statSync(videoPath).size;
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : videoSize - 1;
    const chunkSize = end - start + 1;

    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${videoSize}`);
    res.setHeader('Content-Length', chunkSize);

    const videoStream = fs.createReadStream(videoPath, { start, end });
    videoStream.pipe(res);
  } else {
    res.setHeader('Content-Length', fs.statSync(videoPath).size);
    fs.createReadStream(videoPath).pipe(res);
  }
});

// Middleware de manejo de errores global
app.use((err, req, res, next) => {
  console.error(`Error en ${req.method} ${req.url}:`, err.stack);
  res.status(500).json({ error: 'Error interno del servidor', details: err.message });
});

// Iniciar el servidor
app.listen(port, host, () => {
  console.log(`Servidor escuchando en http://${host}:${port}`);
});

process.on('SIGTERM', () => db.close());
process.on('SIGINT', () => db.close());