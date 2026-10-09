const { Router } = require('express');
const { userAuth } = require('../middlewares/user');
const { viewCoursesController, coursePurchaseController, listCourses, getCourse } = require('../controllers/courseController');

const courseRouter = Router();
courseRouter.post('/purchase', userAuth, coursePurchaseController);
courseRouter.get('/preview', viewCoursesController);
courseRouter.get('/', listCourses);
courseRouter.get('/:id', getCourse);

module.exports = { courseRouter };
